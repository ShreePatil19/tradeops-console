// Full UI-stream replay cache, separate from the text-only cache in cache.ts.
//
// Used by /api/agents/invoice (and any other agent whose primary payload is a
// structured tool call, not the assistant text). On a cache miss the route
// captures the final text, tool calls, and tool results from streamText's
// onFinish callback and persists them as a single JSON blob under
// `cache-stream:<agent>:<hash>`. On a cache hit, the route replays the events
// through createUIMessageStream so the client gets the same tool-call cards
// that the live model would have produced.
//
// Coexists with the text-only cache in cache.ts (key prefix `cache:`). The
// two are independent so qa/inbox/compliance keep their existing entries.

import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { kv } from "@/lib/kv";
import { TRACE_HEADER } from "@/lib/trace";

export type CachedToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type CachedToolResult = {
  toolCallId: string;
  output: unknown;
};

export type CachedReplay = {
  text: string;
  toolCalls: CachedToolCall[];
  toolResults: CachedToolResult[];
};

const CACHE_TTL_SECONDS = 60 * 60;

export function cacheStreamKey(agent: string, hash: string): string {
  return `cache-stream:${agent}:${hash}`;
}

export function serialiseReplay(replay: CachedReplay): string {
  return JSON.stringify(replay);
}

export function deserialiseReplay(s: string): CachedReplay | null {
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as {
      text?: unknown;
      toolCalls?: unknown;
      toolResults?: unknown;
    };
    if (typeof obj.text !== "string") return null;
    if (!Array.isArray(obj.toolCalls)) return null;
    if (!Array.isArray(obj.toolResults)) return null;
    for (const tc of obj.toolCalls) {
      if (!tc || typeof tc !== "object") return null;
      const t = tc as { toolCallId?: unknown; toolName?: unknown };
      if (typeof t.toolCallId !== "string") return null;
      if (typeof t.toolName !== "string") return null;
    }
    for (const tr of obj.toolResults) {
      if (!tr || typeof tr !== "object") return null;
      const t = tr as { toolCallId?: unknown };
      if (typeof t.toolCallId !== "string") return null;
    }
    return obj as CachedReplay;
  } catch {
    return null;
  }
}

export async function getCachedReplay(
  agent: string,
  hash: string
): Promise<CachedReplay | null> {
  try {
    const raw = await kv.get<string>(cacheStreamKey(agent, hash));
    if (raw === null || raw === undefined) return null;
    return deserialiseReplay(raw);
  } catch {
    return null;
  }
}

export async function setCachedReplay(
  agent: string,
  hash: string,
  replay: CachedReplay
): Promise<void> {
  try {
    const key = cacheStreamKey(agent, hash);
    await kv.set(key, serialiseReplay(replay));
    await kv.expire(key, CACHE_TTL_SECONDS);
  } catch {
    // Silent: cache misses on the next request are always safe.
  }
}

export function buildFullReplayResponse(args: {
  replay: CachedReplay;
  trace_id: string;
}): Response {
  const replayStream = createUIMessageStream({
    execute({ writer }) {
      writer.write({ type: "start" });
      for (const tc of args.replay.toolCalls) {
        writer.write({
          type: "tool-input-available",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.input,
        });
      }
      for (const tr of args.replay.toolResults) {
        writer.write({
          type: "tool-output-available",
          toolCallId: tr.toolCallId,
          output: tr.output,
        });
      }
      if (args.replay.text.length > 0) {
        const textId = "cached-text";
        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: args.replay.text });
        writer.write({ type: "text-end", id: textId });
      }
      writer.write({ type: "finish" });
    },
  });
  const response = createUIMessageStreamResponse({ stream: replayStream });
  response.headers.set(TRACE_HEADER, args.trace_id);
  response.headers.set("X-Cache", "HIT");
  return response;
}
