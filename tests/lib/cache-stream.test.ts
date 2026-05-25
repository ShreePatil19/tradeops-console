import { describe, it, expect, vi } from "vitest";

vi.mock("ai", () => ({
  createUIMessageStream: vi.fn((opts: { execute: (args: { writer: { write: (e: unknown) => void } }) => void }) => {
    const events: unknown[] = [];
    opts.execute({ writer: { write: (e: unknown) => events.push(e) } });
    return events;
  }),
  createUIMessageStreamResponse: vi.fn((opts: { stream: unknown[] }) => {
    return new Response(JSON.stringify(opts.stream), { status: 200 });
  }),
}));

import {
  serialiseReplay,
  deserialiseReplay,
  cacheStreamKey,
  buildFullReplayResponse,
  type CachedReplay,
} from "@/lib/cache-stream";
import { TRACE_HEADER } from "@/lib/trace";

function baseReplay(): CachedReplay {
  return {
    text: "Extracted 3 line items.",
    toolCalls: [
      {
        toolCallId: "call_1",
        toolName: "extract_line_items",
        input: { lineItems: [{ description: "widget", quantity: 2 }] },
      },
    ],
    toolResults: [
      {
        toolCallId: "call_1",
        output: { captured: true, lineCount: 1 },
      },
    ],
  };
}

describe("serialiseReplay", () => {
  it("returns a JSON string that round-trips through JSON.parse", () => {
    const replay = baseReplay();
    const s = serialiseReplay(replay);
    expect(typeof s).toBe("string");
    expect(JSON.parse(s)).toEqual(replay);
  });

  it("handles an empty toolCalls + toolResults shape", () => {
    const s = serialiseReplay({ text: "hi", toolCalls: [], toolResults: [] });
    expect(JSON.parse(s)).toEqual({ text: "hi", toolCalls: [], toolResults: [] });
  });
});

describe("deserialiseReplay", () => {
  it("round-trips with serialiseReplay", () => {
    const replay = baseReplay();
    const parsed = deserialiseReplay(serialiseReplay(replay));
    expect(parsed).toEqual(replay);
  });

  it("returns null for invalid JSON", () => {
    expect(deserialiseReplay("not json")).toBeNull();
  });

  it("returns null when text field is missing", () => {
    expect(deserialiseReplay(JSON.stringify({ toolCalls: [], toolResults: [] }))).toBeNull();
  });

  it("returns null when toolCalls is not an array", () => {
    expect(
      deserialiseReplay(
        JSON.stringify({ text: "x", toolCalls: "nope", toolResults: [] })
      )
    ).toBeNull();
  });

  it("returns null when a toolCall is missing toolCallId or toolName", () => {
    expect(
      deserialiseReplay(
        JSON.stringify({
          text: "x",
          toolCalls: [{ toolName: "x" }],
          toolResults: [],
        })
      )
    ).toBeNull();
  });

  it("returns null when a toolResult is missing toolCallId", () => {
    expect(
      deserialiseReplay(
        JSON.stringify({
          text: "x",
          toolCalls: [],
          toolResults: [{ output: 1 }],
        })
      )
    ).toBeNull();
  });
});

describe("cacheStreamKey", () => {
  it("formats as cache-stream:<agent>:<hash>", () => {
    expect(cacheStreamKey("invoice", "abc123")).toBe("cache-stream:invoice:abc123");
  });

  it("includes the agent in the key", () => {
    expect(cacheStreamKey("qa", "h")).toBe("cache-stream:qa:h");
  });
});

describe("buildFullReplayResponse", () => {
  it("returns a Response with X-Cache HIT and X-Trace-Id set", async () => {
    const res = buildFullReplayResponse({
      replay: baseReplay(),
      trace_id: "trace-xyz",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(res.headers.get(TRACE_HEADER)).toBe("trace-xyz");
  });

  it("emits tool-input-available for each cached tool call", async () => {
    const res = buildFullReplayResponse({
      replay: baseReplay(),
      trace_id: "t",
    });
    const events = JSON.parse(await res.text()) as Array<{ type: string; toolCallId?: string; toolName?: string }>;
    const toolEvents = events.filter((e) => e.type === "tool-input-available");
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0]?.toolCallId).toBe("call_1");
    expect(toolEvents[0]?.toolName).toBe("extract_line_items");
  });

  it("emits tool-output-available for each cached tool result", async () => {
    const res = buildFullReplayResponse({
      replay: baseReplay(),
      trace_id: "t",
    });
    const events = JSON.parse(await res.text()) as Array<{ type: string; toolCallId?: string }>;
    const outputEvents = events.filter((e) => e.type === "tool-output-available");
    expect(outputEvents).toHaveLength(1);
    expect(outputEvents[0]?.toolCallId).toBe("call_1");
  });

  it("emits text-start / text-delta / text-end when text is non-empty", async () => {
    const res = buildFullReplayResponse({
      replay: { ...baseReplay(), text: "hello" },
      trace_id: "t",
    });
    const events = JSON.parse(await res.text()) as Array<{ type: string; delta?: string }>;
    expect(events.some((e) => e.type === "text-start")).toBe(true);
    expect(events.find((e) => e.type === "text-delta")?.delta).toBe("hello");
    expect(events.some((e) => e.type === "text-end")).toBe(true);
  });

  it("skips text events entirely when text is empty (tool-only replay)", async () => {
    const res = buildFullReplayResponse({
      replay: { ...baseReplay(), text: "" },
      trace_id: "t",
    });
    const events = JSON.parse(await res.text()) as Array<{ type: string }>;
    expect(events.some((e) => e.type.startsWith("text-"))).toBe(false);
  });

  it("emits a start event first and a finish event last", async () => {
    const res = buildFullReplayResponse({
      replay: baseReplay(),
      trace_id: "t",
    });
    const events = JSON.parse(await res.text()) as Array<{ type: string }>;
    expect(events[0]?.type).toBe("start");
    expect(events[events.length - 1]?.type).toBe("finish");
  });
});
