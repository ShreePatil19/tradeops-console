import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/kv", () => {
  const store = new Map<string, number>();
  return {
    kv: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        store.set(key, Number(value));
        return "OK";
      }),
      incr: vi.fn(async (key: string) => {
        const next = (store.get(key) ?? 0) + 1;
        store.set(key, next);
        return next;
      }),
      expire: vi.fn(async () => 1),
      del: vi.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
    },
    __store: store,
  };
});

import * as kvMod from "@/lib/kv";
import {
  checkRateLimit,
  bumpRateLimit,
  checkGlobalBudget,
  bumpGlobalBudget,
  formatHeaders,
  LIMITS,
} from "@/lib/rate-limit";

const STORE = (kvMod as unknown as { __store: Map<string, number> }).__store;

describe("checkRateLimit (per-IP)", () => {
  beforeEach(() => {
    for (const k of Array.from(STORE.keys())) STORE.delete(k);
  });

  it("allows the first request with full remaining quotas", async () => {
    const state = await checkRateLimit("1.2.3.4", "qa");
    expect(state.ok).toBe(true);
    expect(state.remaining.minute).toBe(LIMITS.IP_PER_MIN);
    expect(state.remaining.day).toBe(LIMITS.IP_PER_DAY);
  });

  it("blocks the 6th request in the same minute", async () => {
    for (let i = 0; i < LIMITS.IP_PER_MIN; i++) await bumpRateLimit("1.2.3.4", "qa");
    const state = await checkRateLimit("1.2.3.4", "qa");
    expect(state.ok).toBe(false);
    expect(state.reason).toBe("ip_minute");
    expect(state.retryAfter).toBeGreaterThan(0);
  });

  it("blocks when day cap is hit", async () => {
    const dayKey = `rl:ip:1.2.3.4:qa:day:${Math.floor(Date.now() / 86400000)}`;
    STORE.set(dayKey, LIMITS.IP_PER_DAY);
    const state = await checkRateLimit("1.2.3.4", "qa");
    expect(state.ok).toBe(false);
    expect(state.reason).toBe("ip_day");
  });

  it("separates counters by agent slug", async () => {
    for (let i = 0; i < LIMITS.IP_PER_MIN; i++) await bumpRateLimit("1.2.3.4", "qa");
    const state = await checkRateLimit("1.2.3.4", "inbox");
    expect(state.ok).toBe(true);
  });
});

describe("checkGlobalBudget", () => {
  beforeEach(() => {
    for (const k of Array.from(STORE.keys())) STORE.delete(k);
  });

  it("allows when usage is under the cap", async () => {
    const state = await checkGlobalBudget();
    expect(state.ok).toBe(true);
    expect(state.used).toBe(0);
    expect(state.cap).toBeGreaterThan(0);
  });

  it("blocks when usage meets or exceeds the cap", async () => {
    const dayKey = `budget:global:day:${Math.floor(Date.now() / 86400000)}`;
    STORE.set(dayKey, 9999);
    const state = await checkGlobalBudget();
    expect(state.ok).toBe(false);
    expect(state.used).toBe(9999);
  });

  it("bumpGlobalBudget increments the day counter", async () => {
    await bumpGlobalBudget();
    await bumpGlobalBudget();
    const state = await checkGlobalBudget();
    expect(state.used).toBe(2);
  });
});

describe("formatHeaders", () => {
  it("returns IETF X-RateLimit-* headers on success", () => {
    const headers = formatHeaders({
      ok: true,
      remaining: { minute: 4, day: 29 },
      retryAfter: 0,
      reset: { minute: 1779683900, day: 1779712800 },
    });
    expect(headers["X-RateLimit-Limit"]).toBe(String(LIMITS.IP_PER_MIN));
    expect(headers["X-RateLimit-Remaining"]).toBe("4");
    expect(headers["X-RateLimit-Reset"]).toBe("1779683900");
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("includes Retry-After when limited", () => {
    const headers = formatHeaders({
      ok: false,
      reason: "ip_minute",
      remaining: { minute: 0, day: 25 },
      retryAfter: 17,
      reset: { minute: 1779683900, day: 1779712800 },
    });
    expect(headers["Retry-After"]).toBe("17");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
  });
});
