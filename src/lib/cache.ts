import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { kv } from "@/lib/kv";
import { TRACE_HEADER } from "@/lib/trace";

// CACHE_ENABLED controls which agents participate in response caching.
//
// qa, inbox, and compliance use the text-only cache in this module
// (cache:<agent>:<hash> keys, replay is the assistant text only).
//
// invoice uses the full-stream cache in cache-stream.ts (cache-stream:<agent>:<hash>
// keys, replay re-emits the extract_line_items tool-input and tool-output events
// in addition to text). The toggle below still gates whether the route consults
// either cache at all.
export const CACHE_ENABLED = {
  invoice: true,
  inbox: true,
  compliance: true,
  qa: true,
} as const;

export type AgentSlug = "invoice" | "inbox" | "compliance" | "qa";

export type CacheKey = { agent: AgentSlug; inputHash: string };

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Hash an arbitrary input value to a stable hex string using SHA-256.
 *
 * Object keys are sorted before serialisation so that
 * { a: 1, b: 2 } and { b: 2, a: 1 } produce the same hash.
 *
 * Uses the Web Crypto subtle API (available on Node 18+, Edge Runtime,
 * and all modern browsers).
 */
export async function hashInput(input: unknown): Promise<string> {
  const stable = stableStringify(input);
  const encoded = new TextEncoder().encode(stable);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build the KV key string for a cached agent response.
 * Format: `cache:<agent>:<inputHash>`
 */
export function cacheKey(agent: AgentSlug, inputHash: string): string {
  return `cache:${agent}:${inputHash}`;
}

/**
 * Retrieve a previously cached response text for an agent + input hash.
 * Returns null on a miss or any KV error (fail open).
 */
export async function getCachedResponse(
  agent: AgentSlug,
  inputHash: string
): Promise<string | null> {
  try {
    return await kv.get<string>(cacheKey(agent, inputHash));
  } catch {
    // Fail open: a cache miss is always safe.
    return null;
  }
}

/**
 * Persist a final assistant text response in KV with a 1-hour TTL.
 *
 * Cache replay is text-only. Tool-call cards are not replayed. Full
 * stream replay requires a serialised SSE format (deferred).
 */
export async function setCachedResponse(
  agent: AgentSlug,
  inputHash: string,
  value: string
): Promise<void> {
  try {
    const key = cacheKey(agent, inputHash);
    await kv.set(key, value);
    await kv.expire(key, CACHE_TTL_SECONDS);
  } catch {
    // Silent: a failed write just means the next identical request hits the model.
  }
}

/**
 * Wrap a cached assistant text in a UI message stream response with the
 * X-Cache: HIT and X-Trace-Id headers set. Used by every cache-enabled
 * agent route on a cache hit.
 *
 * Replay is text-only: a single text-start / text-delta / text-end sequence.
 * Tool-call cards are not replayed; see the CACHE_ENABLED comment for the
 * rationale.
 */
export function buildCachedReplay(args: {
  cachedText: string;
  trace_id: string;
}): Response {
  const replayStream = createUIMessageStream({
    execute({ writer }) {
      const textId = "cached-text";
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: args.cachedText });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish" });
    },
  });
  const response = createUIMessageStreamResponse({ stream: replayStream });
  response.headers.set(TRACE_HEADER, args.trace_id);
  response.headers.set("X-Cache", "HIT");
  return response;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * JSON.stringify with sorted object keys for stable hashing.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (k) =>
        JSON.stringify(k) +
        ":" +
        stableStringify((value as Record<string, unknown>)[k])
    )
    .join(",");
  return "{" + sorted + "}";
}
