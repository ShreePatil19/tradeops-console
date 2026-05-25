import { streamText, convertToModelMessages, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";

import { model, requireApiKey, MAX_OUTPUT_TOKENS } from "@/lib/model";
import { checkSanctions } from "@/lib/sanctions";
import { bumpRateLimit, bumpGlobalBudget } from "@/lib/rate-limit";
import { log, logError } from "@/lib/log";
import { readTraceFromHeaders, TRACE_HEADER } from "@/lib/trace";
import {
  hashInput,
  getCachedResponse,
  setCachedResponse,
  buildCachedReplay,
  CACHE_ENABLED,
} from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a sanctions pre-check agent for an Australian trade operations desk.

Workflow:
1. The user gives you a counterparty name (and optional country).
2. Call check_sanctions exactly once with the name.
3. Read the tool result. The tool searches an internal stub register that covers a subset of OFAC SDN, DFAT, EU, and UN lists. It is NOT comprehensive.
4. Return a verdict in this exact format:

VERDICT: <clear / hit / inconclusive>

Then a short paragraph explaining the reasoning, citing the matched list name and reason if the verdict is "hit". If "clear" or "inconclusive", explicitly note that the stub register is not comprehensive and a full screening through Refinitiv World-Check or Dow Jones Risk & Compliance is still required before transacting.

Rules:
- "hit" requires at least one entry in the tool result with a confident name or alias match.
- "inconclusive" applies when the name is too generic, ambiguous, or partially matches an entity.
- "clear" applies when the tool returns no matches and the name is specific enough to be meaningful.
- Never say "this counterparty is safe to transact with". The verdict is a pre-check, not a final clearance.`;

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

    log({ trace_id, agent: "compliance", event: "request_start", input_chars });

    // Text-only response cache. Replay drops tool-call cards by design;
    // see CACHE_ENABLED in src/lib/cache.ts.
    let inputHash: string | null = null;
    if (CACHE_ENABLED.compliance) {
      inputHash = await hashInput(messages);
      const cached = await getCachedResponse("compliance", inputHash);
      if (cached !== null) {
        log({ trace_id, agent: "compliance", event: "cache_hit", input_chars });
        return buildCachedReplay({ cachedText: cached, trace_id });
      }
      log({ trace_id, agent: "compliance", event: "cache_miss", input_chars });
    }

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      maxOutputTokens: MAX_OUTPUT_TOKENS.compliance,
      stopWhen: stepCountIs(3),
      onFinish: (event) => {
        log({ trace_id, agent: "compliance", event: "request_end", latency_ms: Date.now() - startTime, status: 200 });
        if (inputHash !== null && event.text.length > 0) {
          setCachedResponse("compliance", inputHash, event.text).catch(() => {
            /* cache write failure is non-fatal */
          });
        }
        Promise.all([
          bumpRateLimit(ip, "compliance"),
          bumpGlobalBudget(),
        ]).catch(() => {
          /* counter loss is acceptable; never fail the user response */
        });
      },
      tools: {
        check_sanctions: tool({
          description:
            "Search the internal stub sanctions register for a counterparty name. Returns matched entries with list, reason, and matched alias.",
          inputSchema: z.object({
            query: z.string().describe("The counterparty name to screen."),
          }),
          execute: async ({ query }) => {
            log({ trace_id, agent: "compliance", event: "tool_call", tool_name: "check_sanctions" });
            const sanctionsResult = checkSanctions(query);
            return {
              query,
              matched: sanctionsResult.matched,
              matchCount: sanctionsResult.entries.length,
              entries: sanctionsResult.entries.map((entry) => ({
                name: entry.name,
                aliases: entry.aliases,
                list: entry.list,
                reason: entry.reason,
                addedAt: entry.addedAt,
                matchedOn: entry.matchedOn,
              })),
              note:
                "Stub register only. Covers a small curated subset for demo purposes. Always run a full screen before transacting.",
            };
          },
        }),
      },
    });

    const response = result.toUIMessageStreamResponse();
    response.headers.set(TRACE_HEADER, trace_id);
    if (CACHE_ENABLED.compliance) response.headers.set("X-Cache", "MISS");
    return response;
  } catch (e) {
    logError(trace_id, "compliance", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return new Response(message, { status: 500 });
  }
}
