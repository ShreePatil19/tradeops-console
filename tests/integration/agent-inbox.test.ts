import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  streamTextMock,
  toolMock,
  convertToModelMessagesMock,
  stepCountIsMock,
  requireApiKeyMock,
  bumpRateLimitMock,
  bumpGlobalBudgetMock,
  logMock,
  logErrorMock,
} = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  toolMock: vi.fn((def: unknown) => def),
  convertToModelMessagesMock: vi.fn(async (m: unknown) => m),
  stepCountIsMock: vi.fn((n: number) => ({ __stop: n })),
  requireApiKeyMock: vi.fn(),
  bumpRateLimitMock: vi.fn(async () => undefined),
  bumpGlobalBudgetMock: vi.fn(async () => undefined),
  logMock: vi.fn(),
  logErrorMock: vi.fn(),
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

import { POST } from "@/app/api/agents/inbox/route";
import { TRACE_HEADER } from "@/lib/trace";

type StreamTextArgs = {
  model: unknown;
  system: string;
  messages: unknown;
  maxOutputTokens: number;
  stopWhen: unknown;
  onFinish: () => void;
  tools: Record<
    string,
    { execute: (input: unknown) => Promise<unknown> }
  >;
};

function fakeStreamResult() {
  return {
    toUIMessageStreamResponse: () =>
      new Response("mock-inbox-stream", {
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
  return new Request("http://localhost:3000/api/agents/inbox", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("/api/agents/inbox POST", () => {
  beforeEach(() => {
    streamTextMock.mockReset().mockReturnValue(fakeStreamResult());
    toolMock.mockClear();
    convertToModelMessagesMock.mockClear();
    stepCountIsMock.mockClear();
    requireApiKeyMock.mockReset();
    bumpRateLimitMock.mockReset().mockResolvedValue(undefined);
    bumpGlobalBudgetMock.mockReset().mockResolvedValue(undefined);
    logMock.mockReset();
    logErrorMock.mockReset();
  });

  it("returns 500 when requireApiKey throws", async () => {
    requireApiKeyMock.mockImplementationOnce(() => {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set.");
    });
    const res = await POST(makeRequest(makeMessages("email")));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
    expect(logErrorMock).toHaveBeenCalled();
  });

  it("returns a 200 streaming response with X-Trace-Id attached", async () => {
    const res = await POST(makeRequest(makeMessages("triage this email")));
    expect(res.status).toBe(200);
    expect(res.headers.get(TRACE_HEADER)).toBeTruthy();
  });

  it("echoes inbound X-Trace-Id on the success response", async () => {
    const res = await POST(
      makeRequest(makeMessages("triage"), { [TRACE_HEADER]: "inb-trace-1" })
    );
    expect(res.headers.get(TRACE_HEADER)).toBe("inb-trace-1");
  });

  it("calls streamText with inbox system prompt, 800-token cap, and both inbox tools", async () => {
    await POST(makeRequest(makeMessages("triage this")));
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    expect(args.system).toContain("inbox triage agent");
    expect(args.maxOutputTokens).toBe(800);
    expect(Object.keys(args.tools).sort()).toEqual(["classify_email", "draft_reply"]);
  });

  it("logs request_start with agent=inbox and input_chars matching the user text", async () => {
    const text = "hello inbox email body";
    await POST(makeRequest(makeMessages(text)));
    const startEvents = logMock.mock.calls
      .map((c) => c[0] as { event?: string; agent?: string; input_chars?: number })
      .filter((e) => e.event === "request_start");
    expect(startEvents).toHaveLength(1);
    expect(startEvents[0]?.agent).toBe("inbox");
    expect(startEvents[0]?.input_chars).toBe(text.length);
  });

  it("classify_email execute records the category and confidence and logs the tool call", async () => {
    await POST(makeRequest(makeMessages("triage")));
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    const result = (await args.tools.classify_email!.execute({
      category: "rfq",
      confidence: 0.92,
      reasoning: "Customer is asking for pricing.",
    })) as { recorded: boolean; category: string; confidence: number };
    expect(result).toEqual({ recorded: true, category: "rfq", confidence: 0.92 });

    const toolEvent = logMock.mock.calls
      .map((c) => c[0] as { event?: string; tool_name?: string })
      .find((e) => e.event === "tool_call" && e.tool_name === "classify_email");
    expect(toolEvent).toBeDefined();
  });

  it("draft_reply execute reports drafted, subject, and wordCount split on whitespace", async () => {
    await POST(makeRequest(makeMessages("triage")));
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    const result = (await args.tools.draft_reply!.execute({
      subject: "Re: pricing for AS/NZS conduit",
      body: "Thanks for your enquiry. We will reply within one business day.",
      nextAction: "Send price list within one business day.",
    })) as { drafted: boolean; subject: string; wordCount: number };
    expect(result.drafted).toBe(true);
    expect(result.subject).toBe("Re: pricing for AS/NZS conduit");
    expect(result.wordCount).toBe(11);

    const toolEvent = logMock.mock.calls
      .map((c) => c[0] as { event?: string; tool_name?: string })
      .find((e) => e.event === "tool_call" && e.tool_name === "draft_reply");
    expect(toolEvent).toBeDefined();
  });

  it("onFinish bumps inbox rate limit, global budget, and logs request_end", async () => {
    await POST(
      makeRequest(makeMessages("triage"), {
        "x-forwarded-for": "198.51.100.7",
      })
    );
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    args.onFinish();
    await flushMicrotasks();
    expect(bumpRateLimitMock).toHaveBeenCalledWith("198.51.100.7", "inbox");
    expect(bumpGlobalBudgetMock).toHaveBeenCalledTimes(1);

    const endEvent = logMock.mock.calls
      .map((c) => c[0] as { event?: string; status?: number })
      .find((e) => e.event === "request_end");
    expect(endEvent?.status).toBe(200);
  });
});
