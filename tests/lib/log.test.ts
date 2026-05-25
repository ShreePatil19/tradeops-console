import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { redactString, log, type LogEntry } from "@/lib/log";

// ---------------------------------------------------------------------------
// Mirror the djb2-style hash used internally by log.ts for IP pseudonymisation.
// ---------------------------------------------------------------------------

function hashIp(ip: string): string {
  let h = 5381;
  for (let i = 0; i < ip.length; i++) {
    h = ((h << 5) + h) ^ ip.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// redactString
// ---------------------------------------------------------------------------

describe("redactString", () => {
  it("replaces a simple email address", () => {
    expect(redactString("contact user@example.com today")).toBe("contact [email] today");
  });

  it("replaces multiple email addresses in one string", () => {
    const result = redactString("From: alice@foo.com To: bob@bar.org");
    expect(result).toContain("[email]");
    expect(result).not.toContain("alice@foo.com");
    expect(result).not.toContain("bob@bar.org");
  });

  it("replaces an E.164 international phone number", () => {
    const result = redactString("Call +61401325813 now");
    expect(result).toContain("[phone]");
    expect(result).not.toContain("+61401325813");
  });

  it("replaces an Australian mobile number in local format (04xx)", () => {
    const result = redactString("Mobile: 0412345678");
    expect(result).toContain("[phone]");
    expect(result).not.toContain("0412345678");
  });

  it("replaces an IPv4 address with its hash prefix", () => {
    const result = redactString("Client at 192.168.1.1 connected");
    const expected = `[ip:${hashIp("192.168.1.1")}]`;
    expect(result).toContain(expected);
    expect(result).not.toContain("192.168.1.1");
  });

  it("leaves benign text unchanged", () => {
    const text = "No PII here, just a trade question about FOB.";
    expect(redactString(text)).toBe(text);
  });

  it("handles an empty string", () => {
    expect(redactString("")).toBe("");
  });

  it("replaces email and phone in the same string", () => {
    const result = redactString("Contact user@example.com or +61401325813");
    expect(result).toContain("[email]");
    expect(result).toContain("[phone]");
    expect(result).not.toContain("user@example.com");
    expect(result).not.toContain("+61401325813");
  });
});

// ---------------------------------------------------------------------------
// log PII redaction integration
// ---------------------------------------------------------------------------

describe("log PII redaction", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  function lastLogArg(): LogEntry {
    const spy = console.log as ReturnType<typeof vi.spyOn>;
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
    return JSON.parse(String(lastCall?.[0] ?? "{}")) as LogEntry;
  }

  it("redacts an email address from the error field", () => {
    const entry: LogEntry = {
      trace_id: "t1",
      event: "error",
      error: "Failed for user user@example.com",
    };
    log(entry);
    const out = lastLogArg();
    expect(String(out.error)).toContain("[email]");
    expect(String(out.error)).not.toContain("user@example.com");
  });

  it("pseudonymises the ip field as a hash prefix", () => {
    const entry: LogEntry = {
      trace_id: "t2",
      event: "request_start",
      ip: "10.0.0.1",
    };
    log(entry);
    const out = lastLogArg();
    const expected = `[ip:${hashIp("10.0.0.1")}]`;
    expect(String(out.ip)).toBe(expected);
  });

  it("pseudonymises x-forwarded-for as a hash prefix per IP segment", () => {
    const entry: LogEntry = {
      trace_id: "t3",
      event: "request_start",
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    };
    log(entry);
    const out = lastLogArg();
    const value = String(out["x-forwarded-for"]);
    expect(value).toContain(`[ip:${hashIp("1.2.3.4")}]`);
    expect(value).toContain(`[ip:${hashIp("5.6.7.8")}]`);
    expect(value).not.toContain("1.2.3.4");
  });

  it("preserves non-PII string fields unchanged", () => {
    const entry: LogEntry = {
      trace_id: "t4",
      agent: "qa",
      event: "request_end",
      status: 200,
    };
    log(entry);
    const out = lastLogArg();
    expect(out.event).toBe("request_end");
    expect(out.status).toBe(200);
  });

  it("does not alter numeric fields", () => {
    const entry: LogEntry = {
      trace_id: "t5",
      event: "request_end",
      latency_ms: 123,
      input_chars: 50,
    };
    log(entry);
    const out = lastLogArg();
    expect(out.latency_ms).toBe(123);
    expect(out.input_chars).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// log integration with the Axiom sink
// ---------------------------------------------------------------------------

describe("log Axiom integration", () => {
  const ORIG_TOKEN = process.env.AXIOM_TOKEN;
  const ORIG_DATASET = process.env.AXIOM_DATASET;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (ORIG_TOKEN === undefined) delete process.env.AXIOM_TOKEN;
    else process.env.AXIOM_TOKEN = ORIG_TOKEN;
    if (ORIG_DATASET === undefined) delete process.env.AXIOM_DATASET;
    else process.env.AXIOM_DATASET = ORIG_DATASET;
  });

  it("does not call fetch when AXIOM env vars are absent", async () => {
    delete process.env.AXIOM_TOKEN;
    delete process.env.AXIOM_DATASET;
    log({ trace_id: "t6", event: "noop" });
    // Allow the lazy import + shipToAxiom microtask to settle.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("calls fetch with the Axiom ingest URL when both env vars are set", async () => {
    process.env.AXIOM_TOKEN = "tok";
    process.env.AXIOM_DATASET = "ds";
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true } as Response);
    log({ trace_id: "t7", event: "shipped" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalled();
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v1/datasets/ds/ingest");
  });
});
