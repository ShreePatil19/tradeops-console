import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// KV mock -- mirrors the pattern used in rate-limit.test.ts
// ---------------------------------------------------------------------------
vi.mock("@/lib/kv", () => {
  const store = new Map<string, string>();
  const expiryStore = new Map<string, number>();
  return {
    kv: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return "OK";
      }),
      incr: vi.fn(async (key: string) => {
        const next = Number(store.get(key) ?? "0") + 1;
        store.set(key, String(next));
        return next;
      }),
      expire: vi.fn(async (key: string, ttl: number) => {
        expiryStore.set(key, ttl);
        return 1;
      }),
      del: vi.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
    },
    __store: store,
    __expiryStore: expiryStore,
  };
});

import * as kvMod from "@/lib/kv";
import {
  hashInput,
  cacheKey,
  getCachedResponse,
  setCachedResponse,
  CACHE_ENABLED,
} from "@/lib/cache";

const STORE = (kvMod as unknown as { __store: Map<string, string> }).__store;
const EXPIRY_STORE = (
  kvMod as unknown as { __expiryStore: Map<string, number> }
).__expiryStore;

beforeEach(() => {
  for (const k of Array.from(STORE.keys())) STORE.delete(k);
  for (const k of Array.from(EXPIRY_STORE.keys())) EXPIRY_STORE.delete(k);
});

// ---------------------------------------------------------------------------
// hashInput
// ---------------------------------------------------------------------------
describe("hashInput", () => {
  it("returns a 64-character hex string for a simple string", async () => {
    const hash = await hashInput("hello");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable: same input always produces the same hash", async () => {
    const a = await hashInput({ query: "FOB", agent: "qa" });
    const b = await hashInput({ query: "FOB", agent: "qa" });
    expect(a).toBe(b);
  });

  it("is key-order independent: object key order does not affect the hash", async () => {
    const a = await hashInput({ agent: "qa", query: "FOB" });
    const b = await hashInput({ query: "FOB", agent: "qa" });
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", async () => {
    const a = await hashInput("hello");
    const b = await hashInput("world");
    expect(a).not.toBe(b);
  });

  it("handles arrays stably", async () => {
    const a = await hashInput([1, 2, 3]);
    const b = await hashInput([1, 2, 3]);
    expect(a).toBe(b);
  });

  it("handles nested objects with sorted keys", async () => {
    const a = await hashInput({ z: { b: 2, a: 1 }, y: [3, 4] });
    const b = await hashInput({ y: [3, 4], z: { a: 1, b: 2 } });
    expect(a).toBe(b);
  });

  it("handles null", async () => {
    const hash = await hashInput(null);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// cacheKey
// ---------------------------------------------------------------------------
describe("cacheKey", () => {
  it("formats as cache:<agent>:<inputHash>", () => {
    const key = cacheKey("qa", "abc123");
    expect(key).toBe("cache:qa:abc123");
  });

  it("differs by agent slug", () => {
    const k1 = cacheKey("qa", "abc123");
    const k2 = cacheKey("invoice", "abc123");
    expect(k1).not.toBe(k2);
  });

  it("differs by inputHash", () => {
    const k1 = cacheKey("qa", "hash1");
    const k2 = cacheKey("qa", "hash2");
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// getCachedResponse
// ---------------------------------------------------------------------------
describe("getCachedResponse", () => {
  it("returns null when the key is not in KV (cache miss)", async () => {
    const result = await getCachedResponse("qa", "nonexistenthash");
    expect(result).toBeNull();
  });

  it("returns the stored string when the key exists (cache hit)", async () => {
    const key = cacheKey("qa", "abc123");
    STORE.set(key, "This is a cached response.");
    const result = await getCachedResponse("qa", "abc123");
    expect(result).toBe("This is a cached response.");
  });

  it("returns null and does not throw when KV throws", async () => {
    const kvAny = kvMod.kv as unknown as { get: ReturnType<typeof vi.fn> };
    kvAny.get.mockRejectedValueOnce(new Error("KV unavailable"));
    const result = await getCachedResponse("qa", "abc123");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setCachedResponse
// ---------------------------------------------------------------------------
describe("setCachedResponse", () => {
  it("writes the value to KV under the expected key", async () => {
    await setCachedResponse("qa", "abc123", "Answer text here.");
    const key = cacheKey("qa", "abc123");
    expect(STORE.get(key)).toBe("Answer text here.");
  });

  it("calls expire with a 1-hour TTL (3600 seconds)", async () => {
    await setCachedResponse("qa", "abc123", "some text");
    const key = cacheKey("qa", "abc123");
    expect(EXPIRY_STORE.get(key)).toBe(3600);
  });

  it("does not throw when KV throws", async () => {
    const kvAny = kvMod.kv as unknown as {
      set: ReturnType<typeof vi.fn>;
    };
    kvAny.set.mockRejectedValueOnce(new Error("KV write failed"));
    await expect(
      setCachedResponse("qa", "abc123", "text")
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CACHE_ENABLED flags
// ---------------------------------------------------------------------------
describe("CACHE_ENABLED", () => {
  it("enables caching for every agent (qa/inbox/compliance text-only, invoice full-stream)", () => {
    expect(CACHE_ENABLED.qa).toBe(true);
    expect(CACHE_ENABLED.inbox).toBe(true);
    expect(CACHE_ENABLED.compliance).toBe(true);
    expect(CACHE_ENABLED.invoice).toBe(true);
  });
});
