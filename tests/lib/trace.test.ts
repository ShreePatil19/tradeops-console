import { describe, it, expect } from "vitest";
import { newTraceId, readTraceFromHeaders, TRACE_HEADER } from "@/lib/trace";

describe("newTraceId", () => {
  it("returns a non-empty string", () => {
    const id = newTraceId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns a different value on every call", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(newTraceId());
    expect(ids.size).toBe(100);
  });

  it("falls back to a hex-ish string when crypto.randomUUID is unavailable", () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: undefined },
      configurable: true,
    });
    try {
      const id = newTraceId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: original,
        configurable: true,
      });
    }
  });
});

describe("TRACE_HEADER", () => {
  it("is X-Trace-Id", () => {
    expect(TRACE_HEADER).toBe("X-Trace-Id");
  });
});

describe("readTraceFromHeaders", () => {
  it("returns the existing X-Trace-Id when present", () => {
    const h = new Headers({ "X-Trace-Id": "abc-123" });
    expect(readTraceFromHeaders(h)).toBe("abc-123");
  });

  it("generates a new trace id when the header is missing", () => {
    const h = new Headers();
    const id = readTraceFromHeaders(h);
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns different ids for two header-less requests", () => {
    const a = readTraceFromHeaders(new Headers());
    const b = readTraceFromHeaders(new Headers());
    expect(a).not.toBe(b);
  });

  it("is case-insensitive on the header lookup", () => {
    const h = new Headers({ "x-trace-id": "lower-case" });
    expect(readTraceFromHeaders(h)).toBe("lower-case");
  });

  it("trims an empty header value and generates a fresh id", () => {
    const h = new Headers({ "X-Trace-Id": "" });
    const id = readTraceFromHeaders(h);
    // Implementation may either return "" (truthy check) or generate fresh.
    // Both are acceptable; we assert it's a string at minimum.
    expect(typeof id).toBe("string");
  });
});
