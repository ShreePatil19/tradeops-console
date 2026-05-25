import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  cacheEnabledRef,
  streamTextMock,
  toolMock,
  convertToModelMessagesMock,
  stepCountIsMock,
  requireApiKeyMock,
  bumpRateLimitMock,
  bumpGlobalBudgetMock,
  logMock,
  logErrorMock,
  hashInputMock,
  getCachedReplayMock,
  setCachedReplayMock,
  buildFullReplayResponseMock,
} = vi.hoisted(() => ({
  cacheEnabledRef: {
    invoice: true,
    inbox: true,
    compliance: true,
    qa: true,
  },
  streamTextMock: vi.fn(),
  toolMock: vi.fn((def: unknown) => def),
  convertToModelMessagesMock: vi.fn(async (m: unknown) => m),
  stepCountIsMock: vi.fn((n: number) => ({ __stop: n })),
  requireApiKeyMock: vi.fn(),
  bumpRateLimitMock: vi.fn(async () => undefined),
  bumpGlobalBudgetMock: vi.fn(async () => undefined),
  logMock: vi.fn(),
  logErrorMock: vi.fn(),
  hashInputMock: vi.fn(async () => "fixed-hash"),
  getCachedReplayMock: vi.fn(async () => null as unknown),
  setCachedReplayMock: vi.fn(async () => undefined),
  buildFullReplayResponseMock: vi.fn(({ trace_id }: { trace_id: string }) => {
    const r = new Response("cached-replay", { status: 200 });
    r.headers.set("X-Trace-Id", trace_id);
    r.headers.set("X-Cache", "HIT");
    return r;
  }),
}));

vi.mock("ai", () => ({
  streamText: streamTextMock,
  tool: toolMock,
  convertToModelMessages: convertToModelMessagesMock,
  stepCountIs: stepCountIsMock,
}));

vi.mock("@/lib/model", () => ({
  model: { __mock: "model" },
  requireApiKey: requireApiKeyMock,
  MAX_OUTPUT_TOKENS: { invoice: 2000, inbox: 800, compliance: 600, qa: 1200 },
}));

vi.mock("@/lib/rate-limit", () => ({
  bumpRateLimit: bumpRateLimitMock,
  bumpGlobalBudget: bumpGlobalBudgetMock,
}));

vi.mock("@/lib/log", () => ({
  log: logMock,
  logError: logErrorMock,
}));

vi.mock("@/lib/cache", () => ({
  CACHE_ENABLED: cacheEnabledRef,
  hashInput: hashInputMock,
}));

vi.mock("@/lib/cache-stream", () => ({
  getCachedReplay: getCachedReplayMock,
  setCachedReplay: setCachedReplayMock,
  buildFullReplayResponse: buildFullReplayResponseMock,
}));

import { POST } from "@/app/api/agents/invoice/route";
import { TRACE_HEADER } from "@/lib/trace";

type StreamFinishEvent = {
  text: string;
  toolCalls: unknown[];
  toolResults: unknown[];
};

type StreamTextArgs = {
  model: unknown;
  system: string;
  messages: unknown;
  maxOutputTokens: number;
  stopWhen: unknown;
  onFinish: (event: StreamFinishEvent) => void;
  tools: Record<
    string,
    { execute: (input: unknown) => Promise<unknown> }
  >;
};

function fakeStreamResult() {
  return {
    toUIMessageStreamResponse: () =>
      new Response("mock-invoice-stream", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
  };
}

function makeMessages(text: string) {
  return {
    messages: [
      {
        role: "user" as const,
        parts: [{ type: "text" as const, text }],
      },
    ],
  };
}

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request("http://localhost:3000/api/agents/invoice", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("/api/agents/invoice POST", () => {
  beforeEach(() => {
    cacheEnabledRef.invoice = true;
    streamTextMock.mockReset().mockReturnValue(fakeStreamResult());
    toolMock.mockClear();
    convertToModelMessagesMock.mockClear();
    stepCountIsMock.mockClear();
    requireApiKeyMock.mockReset();
    bumpRateLimitMock.mockReset().mockResolvedValue(undefined);
    bumpGlobalBudgetMock.mockReset().mockResolvedValue(undefined);
    logMock.mockReset();
    logErrorMock.mockReset();
    hashInputMock.mockReset().mockResolvedValue("fixed-hash");
    getCachedReplayMock.mockReset().mockResolvedValue(null);
    setCachedReplayMock.mockReset().mockResolvedValue(undefined);
    buildFullReplayResponseMock.mockClear();
  });

  it("returns 500 when requireApiKey throws", async () => {
    requireApiKeyMock.mockImplementationOnce(() => {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set.");
    });
    const res = await POST(makeRequest(makeMessages("invoice")));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
    expect(logErrorMock).toHaveBeenCalled();
  });

  it("returns a 200 streaming response with X-Trace-Id attached", async () => {
    const res = await POST(makeRequest(makeMessages("invoice")));
    expect(res.status).toBe(200);
    expect(res.headers.get(TRACE_HEADER)).toBeTruthy();
  });

  it("echoes inbound X-Trace-Id on the success response", async () => {
    const res = await POST(
      makeRequest(makeMessages("invoice"), { [TRACE_HEADER]: "inv-trace-1" })
    );
    expect(res.headers.get(TRACE_HEADER)).toBe("inv-trace-1");
  });

  it("calls streamText with the invoice system prompt, token cap, and extract_line_items tool", async () => {
    await POST(makeRequest(makeMessages("hello invoice")));
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    expect(args.system).toContain("invoice extraction agent");
    expect(args.maxOutputTokens).toBe(2000);
    expect(Object.keys(args.tools)).toEqual(["extract_line_items"]);
    expect(typeof args.onFinish).toBe("function");
  });

  it("logs a request_start event with agent=invoice and input_chars from the user text", async () => {
    const text = "hello world example invoice text";
    await POST(makeRequest(makeMessages(text)));
    const startEvents = logMock.mock.calls
      .map((c) => c[0] as { event?: string; agent?: string; input_chars?: number })
      .filter((e) => e.event === "request_start");
    expect(startEvents).toHaveLength(1);
    expect(startEvents[0]?.agent).toBe("invoice");
    expect(startEvents[0]?.input_chars).toBe(text.length);
  });

  it("extract_line_items execute returns captured totals, average confidence, and currency", async () => {
    await POST(makeRequest(makeMessages("invoice")));
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    const result = (await args.tools.extract_line_items!.execute({
      supplier: "Acme Co",
      invoiceNumber: "INV-1",
      invoiceDate: "2026-05-25",
      currency: "AUD",
      lineItems: [
        { description: "widget", quantity: 2, unitPrice: 10, total: 20, confidence: 0.9 },
        { description: "gizmo", quantity: 1, unitPrice: 30, total: 30, confidence: 0.7 },
      ],
      grandTotal: 50,
    })) as {
      captured: boolean;
      lineCount: number;
      sumOfLineTotals: number;
      averageConfidence: number;
      currency: string;
    };
    expect(result).toEqual({
      captured: true,
      lineCount: 2,
      sumOfLineTotals: 50,
      averageConfidence: 0.8,
      currency: "AUD",
    });
    const toolCallEvent = logMock.mock.calls
      .map((c) => c[0] as { event?: string; tool_name?: string })
      .find((e) => e.event === "tool_call");
    expect(toolCallEvent?.tool_name).toBe("extract_line_items");
  });

  it("onFinish bumps rate limit with the leftmost x-forwarded-for IP and bumps global budget", async () => {
    await POST(
      makeRequest(makeMessages("invoice"), {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      })
    );
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    args.onFinish({ text: "", toolCalls: [], toolResults: [] });
    await flushMicrotasks();
    expect(bumpRateLimitMock).toHaveBeenCalledWith("203.0.113.10", "invoice");
    expect(bumpGlobalBudgetMock).toHaveBeenCalledTimes(1);

    const endEvent = logMock.mock.calls
      .map((c) => c[0] as { event?: string; status?: number; latency_ms?: number })
      .find((e) => e.event === "request_end");
    expect(endEvent?.status).toBe(200);
    expect(typeof endEvent?.latency_ms).toBe("number");
  });

  it("serves a full-stream cached replay as X-Cache: HIT when getCachedReplay returns a value", async () => {
    getCachedReplayMock.mockResolvedValueOnce({
      text: "Extracted 2 line items.",
      toolCalls: [
        { toolCallId: "call_1", toolName: "extract_line_items", input: {} },
      ],
      toolResults: [{ toolCallId: "call_1", output: { captured: true } }],
    });
    const res = await POST(makeRequest(makeMessages("Acme Invoice PDF")));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(getCachedReplayMock).toHaveBeenCalledWith("invoice", "fixed-hash");
    const cacheEvents = logMock.mock.calls
      .map((c) => c[0] as { event?: string })
      .filter((e) => e.event === "cache_hit");
    expect(cacheEvents).toHaveLength(1);
  });

  it("runs streamText on cache miss and sets X-Cache: MISS", async () => {
    getCachedReplayMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(makeMessages("Acme Invoice PDF")));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("MISS");
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const cacheEvents = logMock.mock.calls
      .map((c) => c[0] as { event?: string })
      .filter((e) => e.event === "cache_miss");
    expect(cacheEvents).toHaveLength(1);
  });

  it("onFinish on cache miss persists the captured text + tool calls + tool results", async () => {
    await POST(makeRequest(makeMessages("Acme Invoice PDF")));
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    args.onFinish({
      text: "Extracted the line items.",
      toolCalls: [
        {
          toolCallId: "call_1",
          toolName: "extract_line_items",
          args: { lineItems: [{ description: "widget" }] },
        },
      ],
      toolResults: [
        { toolCallId: "call_1", result: { captured: true, lineCount: 1 } },
      ],
    });
    await flushMicrotasks();
    expect(setCachedReplayMock).toHaveBeenCalledTimes(1);
    const firstCall = setCachedReplayMock.mock.calls[0] as unknown as [string, string, unknown];
    expect(firstCall[0]).toBe("invoice");
    expect(firstCall[1]).toBe("fixed-hash");
    expect(firstCall[2]).toMatchObject({
      text: "Extracted the line items.",
      toolCalls: [
        {
          toolCallId: "call_1",
          toolName: "extract_line_items",
          input: { lineItems: [{ description: "widget" }] },
        },
      ],
      toolResults: [
        { toolCallId: "call_1", output: { captured: true, lineCount: 1 } },
      ],
    });
  });

  it("skips persistence when onFinish event has no text and no toolCalls", async () => {
    await POST(makeRequest(makeMessages("Acme Invoice PDF")));
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    args.onFinish({ text: "", toolCalls: [], toolResults: [] });
    await flushMicrotasks();
    expect(setCachedReplayMock).not.toHaveBeenCalled();
  });

  it("skips the cache code path entirely when CACHE_ENABLED.invoice is false", async () => {
    cacheEnabledRef.invoice = false;
    const res = await POST(makeRequest(makeMessages("plain path")));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBeNull();
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(getCachedReplayMock).not.toHaveBeenCalled();
    expect(hashInputMock).not.toHaveBeenCalled();
  });
});
