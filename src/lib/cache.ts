import { kv } from "@/lib/kv";

// CACHE_ENABLED controls which agents participate in response caching.
// Only qa is enabled for now -- it is the most cache-friendly agent
// (deterministic-ish answers from a fixed corpus). Set to false here
// and the qa route will skip all cache logic.
// To extend to other agents, add their slug to the enabled set and
// remove the TODO comment in their route.
export const CACHE_ENABLED = {
  invoice: false,
  inbox: false,
  compliance: false,
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
