import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  axiomIngestUrl,
  formatAxiomPayload,
  isAxiomEnabled,
  shipToAxiom,
  AXIOM_DEFAULT_HOST,
  type LogEvent,
} from "@/lib/axiom";

const ORIG_TOKEN = process.env.AXIOM_TOKEN;
const ORIG_DATASET = process.env.AXIOM_DATASET;
const ORIG_HOST = process.env.AXIOM_HOST;

function restoreEnv() {
  if (ORIG_TOKEN === undefined) delete process.env.AXIOM_TOKEN;
  else process.env.AXIOM_TOKEN = ORIG_TOKEN;
  if (ORIG_DATASET === undefined) delete process.env.AXIOM_DATASET;
  else process.env.AXIOM_DATASET = ORIG_DATASET;
  if (ORIG_HOST === undefined) delete process.env.AXIOM_HOST;
  else process.env.AXIOM_HOST = ORIG_HOST;
}

describe("axiomIngestUrl", () => {
  it("builds the ingest URL from the default host", () => {
    expect(axiomIngestUrl("my-dataset")).toBe(
      `https://${AXIOM_DEFAULT_HOST}/v1/datasets/my-dataset/ingest`
    );
  });

  it("honours an override host argument", () => {
    expect(axiomIngestUrl("ds", "api.axiom.eu")).toBe(
      "https://api.axiom.eu/v1/datasets/ds/ingest"
    );
  });

  it("URL-encodes special characters in the dataset name", () => {
    expect(axiomIngestUrl("ds with spaces")).toContain("ds%20with%20spaces");
  });
});

describe("formatAxiomPayload", () => {
  it("wraps a single entry in an array", () => {
    const entry: LogEvent = { trace_id: "t1", event: "test" };
    const payload = formatAxiomPayload(entry);
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
  });

  it("attaches an ISO _time field to each event", () => {
    const entry: LogEvent = { trace_id: "t1", event: "test" };
    const payload = formatAxiomPayload(entry);
    const first = payload[0]!;
    expect(typeof first._time).toBe("string");
    expect(() => new Date(first._time)).not.toThrow();
    expect(new Date(first._time).toISOString()).toBe(first._time);
  });

  it("preserves all original fields from the entry", () => {
    const entry: LogEvent = {
      trace_id: "t1",
      event: "request_start",
      agent: "qa",
      input_chars: 42,
    };
    const payload = formatAxiomPayload(entry);
    expect(payload[0]).toMatchObject({
      trace_id: "t1",
      event: "request_start",
      agent: "qa",
      input_chars: 42,
    });
  });

  it("does not override an explicit _time field in the entry", () => {
    const explicit = "2024-01-01T00:00:00.000Z";
    const entry: LogEvent = { trace_id: "t1", event: "test", _time: explicit };
    const payload = formatAxiomPayload(entry);
    expect(payload[0]?._time).toBe(explicit);
  });
});

describe("isAxiomEnabled", () => {
  afterEach(() => restoreEnv());

  it("returns false when AXIOM_TOKEN is missing", () => {
    delete process.env.AXIOM_TOKEN;
    process.env.AXIOM_DATASET = "ds";
    expect(isAxiomEnabled()).toBe(false);
  });

  it("returns false when AXIOM_DATASET is missing", () => {
    process.env.AXIOM_TOKEN = "tok";
    delete process.env.AXIOM_DATASET;
    expect(isAxiomEnabled()).toBe(false);
  });

  it("returns true only when both are present and non-empty", () => {
    process.env.AXIOM_TOKEN = "tok";
    process.env.AXIOM_DATASET = "ds";
    expect(isAxiomEnabled()).toBe(true);
  });

  it("returns false when both are present but empty strings", () => {
    process.env.AXIOM_TOKEN = "";
    process.env.AXIOM_DATASET = "";
    expect(isAxiomEnabled()).toBe(false);
  });
});

describe("shipToAxiom", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    restoreEnv();
  });

  it("does nothing when Axiom env is not configured (fetch is never called)", async () => {
    delete process.env.AXIOM_TOKEN;
    delete process.env.AXIOM_DATASET;
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await shipToAxiom({ trace_id: "t1", event: "noop" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to the ingest URL with bearer token and JSON content type when enabled", async () => {
    process.env.AXIOM_TOKEN = "test-token";
    process.env.AXIOM_DATASET = "test-dataset";
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true } as Response);

    await shipToAxiom({ trace_id: "t1", event: "shipped" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      `https://${AXIOM_DEFAULT_HOST}/v1/datasets/test-dataset/ingest`
    );
    const opts = init as RequestInit;
    expect((opts.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-token"
    );
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
    expect(opts.method).toBe("POST");
    const body = JSON.parse(String(opts.body));
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ trace_id: "t1", event: "shipped" });
  });

  it("uses the AXIOM_HOST override when provided", async () => {
    process.env.AXIOM_TOKEN = "tok";
    process.env.AXIOM_DATASET = "ds";
    process.env.AXIOM_HOST = "api.axiom.eu";
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true } as Response);
    await shipToAxiom({ trace_id: "t1", event: "eu" });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://api.axiom.eu/");
  });

  it("does not throw when fetch rejects (fail open)", async () => {
    process.env.AXIOM_TOKEN = "tok";
    process.env.AXIOM_DATASET = "ds";
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(shipToAxiom({ trace_id: "t1", event: "test" })).resolves.toBeUndefined();
  });

  it("does not throw when Axiom returns non-2xx (fail open)", async () => {
    process.env.AXIOM_TOKEN = "tok";
    process.env.AXIOM_DATASET = "ds";
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(shipToAxiom({ trace_id: "t1", event: "test" })).resolves.toBeUndefined();
  });
});
