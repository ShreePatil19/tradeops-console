import { streamText, convertToModelMessages, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";

import { model, requireApiKey } from "@/lib/model";
import { corpus, type CorpusChunk } from "@/lib/corpus";
import { bumpRateLimit, bumpGlobalBudget } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

function scoreChunk(query: string, chunk: CorpusChunk): number {
  const q = query.toLowerCase();
  const haystack = `${chunk.title} ${chunk.text}`.toLowerCase();
  const queryTokens = q
    .split(/\W+/)
    .filter((t) => t.length > 2);
  if (queryTokens.length === 0) return 0;
  let hits = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) hits += 1;
  }
  return hits / queryTokens.length;
}

function topK(query: string, k = 4): Array<CorpusChunk & { score: number }> {
  return corpus
    .map((chunk) => ({ ...chunk, score: scoreChunk(query, chunk) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

const SYSTEM_PROMPT = `You are a trade operations Q&A agent. You answer questions about Australian customs and ICC Incoterms 2020 using a small in-repo knowledge base.

Workflow:
1. Call search_corpus exactly once with a concise query derived from the user's question.
2. Read the matched chunks.
3. Answer the user's question in plain prose. Cite supporting chunks inline using square-bracket IDs like [incoterms-fob] or [au-import-gst]. Each cited ID must appear in the tool result.
4. If the tool returns no chunks, say so explicitly and answer with "this is outside the scope of the knowledge base" rather than guessing.

Rules:
- Answer in Australian English. No em-dashes. No exclamation marks.
- Keep the answer to 3 short paragraphs at most.
- Every factual claim that comes from the knowledge base must carry an inline [chunk-id] citation.
- Do not invent chunk IDs that did not appear in the tool result.`;

export async function POST(req: Request) {
  try {
    requireApiKey();
    const { messages }: { messages: UIMessage[] } = await req.json();
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(3),
      onFinish: () => {
        Promise.all([bumpRateLimit(ip, "qa"), bumpGlobalBudget()]).catch(
          () => {
            /* counter loss is acceptable; never fail the user response */
          }
        );
      },
      tools: {
        search_corpus: tool({
          description:
            "Search the in-repo trade knowledge base. Returns up to 4 matched chunks, each with id, title, source, and text.",
          inputSchema: z.object({
            query: z.string().describe("Concise search query derived from the user's question."),
          }),
          execute: async ({ query }) => {
            const hits = topK(query, 4);
            return {
              query,
              matchCount: hits.length,
              chunks: hits.map((h) => ({
                id: h.id,
                title: h.title,
                source: h.source,
                text: h.text,
                score: Number(h.score.toFixed(2)),
              })),
            };
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    return new Response(message, { status: 500 });
  }
}
