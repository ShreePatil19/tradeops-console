import { describe, it, expect, beforeEach, vi } from "vitest";

const { checkRateLimitMock, checkGlobalBudgetMock, formatHeadersMock, logMock } =
  vi.hoisted(() => ({
    checkRateLimitMock: vi.fn(),
    checkGlobalBudgetMock: vi.fn(),
    formatHeadersMock: vi.fn(
      (): Record<string, string> => ({
        "X-RateLimit-Limit": "5",
        "X-RateLimit-Remaining": "4",
        "X-RateLimit-Reset": "1779712800",
      })
    ),
    logMock: vi.fn(),
  }));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  checkGlobalBudget: checkGlobalBudgetMock,
  formatHeaders: formatHeadersMock,
}));

vi.mock("@/lib/log", () => ({
  log: logMock,
  logError: vi.fn(),
}));

import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import { TRACE_HEADER } from "@/lib/trace";

function postReq(
  pathname: string,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    method: "POST",
    headers,
  });
}

describe("middleware on /api/agents/*", () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset();
    checkGlobalBudgetMock.mockReset();
    formatHeadersMock.mockClear();
    logMock.mockClear();
    checkRateLimitMock.mockResolvedValue({
      ok: true,
      remaining: { minute: 5, day: 30 },
      retryAfter: 0,
      reset: { minute: 0, day: 0 },
    });
    checkGlobalBudgetMock.mockResolvedValue({
      ok: true,
      used: 0,
      cap: 200,
      resetAt: Math.floor(Date.now() / 1000) + 6 * 3600,
    });
  });

  it("attaches X-Trace-Id to the response", async () => {
    const res = await middleware(postReq("/api/agents/qa"));
    expect(res.headers.get(TRACE_HEADER)).toBeTruthy();
  });

  it("echoes inbound X-Trace-Id", async () => {
    const res = await middleware(
      postReq("/api/agents/qa", { [TRACE_HEADER]: "test-trace-42" })
    );
    expect(res.headers.get(TRACE_HEADER)).toBe("test-trace-42");
  });

  it("returns 413 for POST exceeding agent input cap", async () => {
    const res = await middleware(
      postReq("/api/agents/qa", { "content-length": "999999" })
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("payload_too_large");
    expect(body.maxBytes).toBeGreaterThan(0);
    expect(body.gotBytes).toBe(999999);
  });

  it("logs a payload_too_large event when 413 fires", async () => {
    await middleware(
      postReq("/api/agents/qa", { "content-length": "999999" })
    );
    const calls = logMock.mock.calls.flat();
    const event = calls.find(
      (c) => (c as { event?: string }).event === "payload_too_large"
    );
    expect(event).toBeDefined();
  });

  it("skips the 413 path when Content-Length is missing", async () => {
    const res = await middleware(postReq("/api/agents/qa"));
    expect(res.status).not.toBe(413);
  });

  it("returns 429 with reason from rate-limit when blocked", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      ok: false,
      reason: "ip_minute",
      remaining: { minute: 0, day: 25 },
      retryAfter: 30,
      reset: { minute: 0, day: 0 },
    });
    const res = await middleware(postReq("/api/agents/qa"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
    expect(body.reason).toBe("ip_minute");
    expect(body.retryAfter).toBe(30);
  });

  it("logs a rate_limit_hit event when 429 fires", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      ok: false,
      reason: "ip_minute",
      remaining: { minute: 0, day: 25 },
      retryAfter: 30,
      reset: { minute: 0, day: 0 },
    });
    await middleware(postReq("/api/agents/qa"));
    const events = logMock.mock.calls
      .flat()
      .map((c) => (c as { event?: string }).event)
      .filter(Boolean);
    expect(events).toContain("rate_limit_hit");
  });

  it("returns 429 global_budget_exhausted when global budget is hit", async () => {
    checkGlobalBudgetMock.mockResolvedValueOnce({
      ok: false,
      used: 200,
      cap: 200,
      resetAt: Math.floor(Date.now() / 1000) + 1800,
    });
    const res = await middleware(postReq("/api/agents/qa"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("global_budget_exhausted");
    expect(typeof body.resetAt).toBe("number");
  });

  it("falls through with NextResponse.next when checks pass", async () => {
    const res = await middleware(postReq("/api/agents/qa"));
    expect(res.status).toBe(200);
  });

  it("sets X-RateLimit-* headers from formatHeaders on the success response", async () => {
    const res = await middleware(postReq("/api/agents/qa"));
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
  });

  it("extracts agent slug from path /api/agents/{slug}", async () => {
    await middleware(postReq("/api/agents/inbox"));
    const callArgs = checkRateLimitMock.mock.calls[0];
    expect(callArgs[1]).toBe("inbox");
  });

  it("uses the leftmost x-forwarded-for entry as the client IP", async () => {
    await middleware(
      postReq("/api/agents/qa", {
        "x-forwarded-for": "203.0.113.5, 10.0.0.1, 172.16.0.1",
      })
    );
    const callArgs = checkRateLimitMock.mock.calls[0];
    expect(callArgs[0]).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    await middleware(
      postReq("/api/agents/qa", { "x-real-ip": "198.51.100.7" })
    );
    const callArgs = checkRateLimitMock.mock.calls[0];
    expect(callArgs[0]).toBe("198.51.100.7");
  });
});
