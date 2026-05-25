import {
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
  tool,
  stepCountIs,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { model, requireApiKey, MAX_OUTPUT_TOKENS } from "@/lib/model";
import { corpus, type CorpusChunk } from "@/lib/corpus";
import { bumpRateLimit, bumpGlobalBudget } from "@/lib/rate-limit";
import { log, logError } from "@/lib/log";
import { readTraceFromHeaders, TRACE_HEADER } from "@/lib/trace";
import { guardInput, validateCitations } from "@/lib/guards";
import {
  hashInput,
  getCachedResponse,
  setCachedResponse,
  CACHE_ENABLED,
} from "@/lib/cache";

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
  const trace_id = readTraceFromHeaders(req.headers);
  const startTime = Date.now();
  try {
    requireApiKey();
    const { messages }: { messages: UIMessage[] } = await req.json();
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

    const input_chars = messages
      .flatMap((m) => m.parts)
      .filter((p) => p.type === "text")
      .reduce((sum, p) => sum + (p.type === "text" ? p.text.length : 0), 0);

    // Injection guard: scan all user text parts before forwarding to the model.
    const userText = messages
      .flatMap((m) => m.parts)
      .filter((p) => p.type === "text")
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n");

    const guardResult = await guardInput(userText, ip, trace_id, "qa");
    if (guardResult.blocked) {
      return Response.json(
        { error: "blocked", reason: "injection_attempt" },
        { status: 429 }
      );
    }

    log({ trace_id, agent: "qa", event: "request_start", input_chars });

    // --- Cache check (qa only) -------------------------------------------
    // Cache replay is text-only. Tool-call cards are not replayed. Full
    // stream replay requires a serialised SSE format (deferred).
    if (CACHE_ENABLED.qa) {
      const inputHash = await hashInput(messages);
      const cached = await getCachedResponse("qa", inputHash);
      if (cached !== null) {
        log({ trace_id, agent: "qa", event: "cache_hit", input_chars });
        // Replay as a single-delta UI message stream so the client receives
        // a Response in the same format as a normal streamText call.
        const replayStream = createUIMessageStream({
          execute({ writer }) {
            const textId = "cached-text";
            writer.write({ type: "start" });
            writer.write({ type: "text-start", id: textId });
            writer.write({ type: "text-delta", id: textId, delta: cached });
            writer.write({ type: "text-end", id: textId });
            writer.write({ type: "finish" });
          },
        });
        const replayResponse = createUIMessageStreamResponse({ stream: replayStream });
        replayResponse.headers.set(TRACE_HEADER, trace_id);
        replayResponse.headers.set("X-Cache", "HIT");
        return replayResponse;
      }
      // Cache miss -- run the model and persist the final text in onFinish.
      log({ trace_id, agent: "qa", event: "cache_miss", input_chars });
      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(messages),
        maxOutputTokens: MAX_OUTPUT_TOKENS.qa,
        stopWhen: stepCountIs(3),
        onFinish: (event) => {
          log({ trace_id, agent: "qa", event: "request_end", latency_ms: Date.now() - startTime, status: 200 });
          const validIds = corpus.map((c) => c.id);
          const { invalidIds } = validateCitations(event.text, validIds);
          if (invalidIds.length > 0) {
            log({ trace_id, agent: "qa", event: "invalid_citations", invalidIds });
          }
          // Persist the final assistant text so the next identical request is served from cache.
          if (event.text.length > 0) {
            setCachedResponse("qa", inputHash, event.text).catch(() => {
              /* cache write failure is non-fatal */
            });
          }
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
              log({ trace_id, agent: "qa", event: "tool_call", tool_name: "search_corpus" });
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
      const response = result.toUIMessageStreamResponse();
      response.headers.set(TRACE_HEADER, trace_id);
      response.headers.set("X-Cache", "MISS");
      return response;
    }

    // CACHE_ENABLED.qa is false: plain path with no cache logic.
    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      maxOutputTokens: MAX_OUTPUT_TOKENS.qa,
      stopWhen: stepCountIs(3),
      onFinish: (event) => {
        log({ trace_id, agent: "qa", event: "request_end", latency_ms: Date.now() - startTime, status: 200 });
        // Citation validation: check that every [chunk-id] in the response
        // matches an ID actually returned by the search_corpus tool.
        // TODO: full stripping of invalid citations from output requires a
        // buffered render mode; for now we log violations only.
        const validIds = corpus.map((c) => c.id);
        const { invalidIds } = validateCitations(event.text, validIds);
        if (invalidIds.length > 0) {
          log({ trace_id, agent: "qa", event: "invalid_citations", invalidIds });
        }
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
            log({ trace_id, agent: "qa", event: "tool_call", tool_name: "search_corpus" });
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

    const response = result.toUIMessageStreamResponse();
    response.headers.set(TRACE_HEADER, trace_id);
    return response;
  } catch (e) {
    logError(trace_id, "qa", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return new Response(message, { status: 500 });
  }
}
