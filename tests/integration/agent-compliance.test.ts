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
  checkSanctionsMock,
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
  checkSanctionsMock: vi.fn(),
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

vi.mock("@/lib/sanctions", () => ({
  checkSanctions: checkSanctionsMock,
}));

import { POST } from "@/app/api/agents/compliance/route";
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

type SanctionsEntry = {
  name: string;
  aliases: string[];
  list: string;
  reason: string;
  addedAt: string;
  matchedOn?: string;
};

function fakeStreamResult() {
  return {
    toUIMessageStreamResponse: () =>
      new Response("mock-compliance-stream", {
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
  return new Request("http://localhost:3000/api/agents/compliance", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("/api/agents/compliance POST", () => {
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
    checkSanctionsMock.mockReset().mockReturnValue({ matched: false, entries: [] });
  });

  it("returns 500 when requireApiKey throws", async () => {
    requireApiKeyMock.mockImplementationOnce(() => {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set.");
    });
    const res = await POST(makeRequest(makeMessages("Acme Trading")));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
    expect(logErrorMock).toHaveBeenCalled();
  });

  it("returns a 200 streaming response with X-Trace-Id attached", async () => {
    const res = await POST(makeRequest(makeMessages("Acme Trading")));
    expect(res.status).toBe(200);
    expect(res.headers.get(TRACE_HEADER)).toBeTruthy();
  });

  it("echoes inbound X-Trace-Id on the success response", async () => {
    const res = await POST(
      makeRequest(makeMessages("Acme"), { [TRACE_HEADER]: "comp-trace-1" })
    );
    expect(res.headers.get(TRACE_HEADER)).toBe("comp-trace-1");
  });

  it("calls streamText with compliance system prompt, 600-token cap, and check_sanctions tool", async () => {
    await POST(makeRequest(makeMessages("Acme Trading Pty Ltd")));
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    expect(args.system).toContain("sanctions pre-check agent");
    expect(args.maxOutputTokens).toBe(600);
    expect(Object.keys(args.tools)).toEqual(["check_sanctions"]);
  });

  it("logs request_start with agent=compliance and input_chars matching the user text", async () => {
    const text = "Acme Trading Pty Ltd, Australia";
    await POST(makeRequest(makeMessages(text)));
    const startEvents = logMock.mock.calls
      .map((c) => c[0] as { event?: string; agent?: string; input_chars?: number })
      .filter((e) => e.event === "request_start");
    expect(startEvents).toHaveLength(1);
    expect(startEvents[0]?.agent).toBe("compliance");
    expect(startEvents[0]?.input_chars).toBe(text.length);
  });

  it("check_sanctions execute returns matched entries when checkSanctions reports a hit", async () => {
    const matchedEntry: SanctionsEntry = {
      name: "Sanctioned Co",
      aliases: ["S-Co"],
      list: "OFAC SDN",
      reason: "Designated under Executive Order 13224.",
      addedAt: "2024-01-15",
      matchedOn: "Sanctioned Co",
    };
    checkSanctionsMock.mockReturnValueOnce({
      matched: true,
      entries: [matchedEntry],
    });

    await POST(makeRequest(makeMessages("Sanctioned Co")));
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    const result = (await args.tools.check_sanctions!.execute({
      query: "Sanctioned Co",
    })) as {
      query: string;
      matched: boolean;
      matchCount: number;
      entries: SanctionsEntry[];
      note: string;
    };

    expect(checkSanctionsMock).toHaveBeenCalledWith("Sanctioned Co");
    expect(result.matched).toBe(true);
    expect(result.matchCount).toBe(1);
    expect(result.entries[0]?.list).toBe("OFAC SDN");
    expect(result.note).toContain("Stub register");

    const toolEvent = logMock.mock.calls
      .map((c) => c[0] as { event?: string; tool_name?: string })
      .find((e) => e.event === "tool_call" && e.tool_name === "check_sanctions");
    expect(toolEvent).toBeDefined();
  });

  it("check_sanctions execute returns matchCount=0 when no register entry matches", async () => {
    checkSanctionsMock.mockReturnValueOnce({ matched: false, entries: [] });

    await POST(makeRequest(makeMessages("Clean Importer Ltd")));
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    const result = (await args.tools.check_sanctions!.execute({
      query: "Clean Importer Ltd",
    })) as { matched: boolean; matchCount: number; entries: unknown[] };

    expect(result.matched).toBe(false);
    expect(result.matchCount).toBe(0);
    expect(result.entries).toEqual([]);
  });

  it("onFinish bumps compliance rate limit, global budget, and logs request_end", async () => {
    await POST(
      makeRequest(makeMessages("Acme"), {
        "x-forwarded-for": "192.0.2.42",
      })
    );
    const args = streamTextMock.mock.calls[0]?.[0] as StreamTextArgs;
    args.onFinish();
    await flushMicrotasks();
    expect(bumpRateLimitMock).toHaveBeenCalledWith("192.0.2.42", "compliance");
    expect(bumpGlobalBudgetMock).toHaveBeenCalledTimes(1);

    const endEvent = logMock.mock.calls
      .map((c) => c[0] as { event?: string; status?: number })
      .find((e) => e.event === "request_end");
    expect(endEvent?.status).toBe(200);
  });
});
