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
import { GET } from "@/app/api/budget/route";
import { TRACE_HEADER } from "@/lib/trace";

const STORE = (kvMod as unknown as { __store: Map<string, number> }).__store;

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/budget", {
    method: "GET",
    headers,
  });
}

function makeAgentRequest(
  agent: string,
  headers: Record<string, string> = {}
): Request {
  return new Request(
    `http://localhost:3000/api/budget?agent=${encodeURIComponent(agent)}`,
    { method: "GET", headers }
  );
}

describe("/api/budget GET", () => {
  beforeEach(() => {
    for (const k of Array.from(STORE.keys())) STORE.delete(k);
  });

  it("returns {used, cap, resetAt} JSON shape", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { used: number; cap: number; resetAt: number };
    expect(typeof body.used).toBe("number");
    expect(typeof body.cap).toBe("number");
    expect(typeof body.resetAt).toBe("number");
  });

  it("returns used=0 when no calls have been counted today", async () => {
    const res = await GET(makeRequest());
    const body = (await res.json()) as { used: number };
    expect(body.used).toBe(0);
  });

  it("reflects the global counter from KV", async () => {
    const dayEpoch = Math.floor(Date.now() / 86400000);
    STORE.set(`budget:global:day:${dayEpoch}`, 137);
    const res = await GET(makeRequest());
    const body = (await res.json()) as { used: number; cap: number };
    expect(body.used).toBe(137);
    expect(body.cap).toBeGreaterThanOrEqual(137);
  });

  it("returns a resetAt epoch in the future (within 24h)", async () => {
    const res = await GET(makeRequest());
    const body = (await res.json()) as { resetAt: number };
    const nowS = Math.floor(Date.now() / 1000);
    expect(body.resetAt).toBeGreaterThan(nowS);
    expect(body.resetAt).toBeLessThanOrEqual(nowS + 24 * 3600);
  });

  it("attaches an X-Trace-Id response header", async () => {
    const res = await GET(makeRequest());
    expect(res.headers.get(TRACE_HEADER)).toBeTruthy();
  });

  it("echoes the inbound X-Trace-Id when one is provided", async () => {
    const res = await GET(makeRequest({ [TRACE_HEADER]: "inbound-trace-99" }));
    expect(res.headers.get(TRACE_HEADER)).toBe("inbound-trace-99");
  });
});

describe("/api/budget GET with ?agent= query", () => {
  beforeEach(() => {
    for (const k of Array.from(STORE.keys())) STORE.delete(k);
  });

  it("omits the agent field when ?agent is not provided (backwards compat)", async () => {
    const res = await GET(makeRequest());
    const body = (await res.json()) as { agent?: unknown };
    expect(body.agent).toBeUndefined();
  });

  it("includes a nested agent block when ?agent=qa is provided", async () => {
    const res = await GET(makeAgentRequest("qa"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agent?: { slug: string; perIpUsed: number; perIpCap: number; perIpResetAt: number };
    };
    expect(body.agent).toBeDefined();
    expect(body.agent?.slug).toBe("qa");
    expect(typeof body.agent?.perIpUsed).toBe("number");
    expect(typeof body.agent?.perIpCap).toBe("number");
    expect(typeof body.agent?.perIpResetAt).toBe("number");
  });

  it("reads the per-IP per-agent day counter from KV when supplied", async () => {
    const dayEpoch = Math.floor(Date.now() / 86400000);
    STORE.set(`rl:ip:203.0.113.5:qa:day:${dayEpoch}`, 7);
    const res = await GET(
      makeAgentRequest("qa", { "x-forwarded-for": "203.0.113.5" })
    );
    const body = (await res.json()) as {
      agent?: { perIpUsed: number };
    };
    expect(body.agent?.perIpUsed).toBe(7);
  });

  it("uses LIMITS.IP_PER_DAY (30) as the per-IP cap", async () => {
    const res = await GET(makeAgentRequest("invoice"));
    const body = (await res.json()) as { agent?: { perIpCap: number } };
    expect(body.agent?.perIpCap).toBe(30);
  });

  it("returns a per-IP resetAt at next midnight UTC", async () => {
    const res = await GET(makeAgentRequest("qa"));
    const body = (await res.json()) as { agent?: { perIpResetAt: number } };
    const nowS = Math.floor(Date.now() / 1000);
    expect(body.agent?.perIpResetAt).toBeGreaterThan(nowS);
    expect(body.agent?.perIpResetAt).toBeLessThanOrEqual(nowS + 24 * 3600);
  });

  it("rejects an unknown agent slug with 400", async () => {
    const res = await GET(makeAgentRequest("unknown-agent"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_agent");
  });

  it("still returns the global block alongside the agent block", async () => {
    const dayEpoch = Math.floor(Date.now() / 86400000);
    STORE.set(`budget:global:day:${dayEpoch}`, 42);
    const res = await GET(makeAgentRequest("qa"));
    const body = (await res.json()) as {
      used: number;
      cap: number;
      agent?: { slug: string };
    };
    expect(body.used).toBe(42);
    expect(body.cap).toBeGreaterThan(0);
    expect(body.agent?.slug).toBe("qa");
  });
});
