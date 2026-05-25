export type LogEntry = {
  trace_id: string;
  agent?: "invoice" | "inbox" | "compliance" | "qa" | "budget" | "middleware";
  event: string;
  latency_ms?: number;
  input_chars?: number;
  output_chars?: number;
  tool_name?: string;
  status?: number;
  error?: string;
  [k: string]: unknown;
};

const TEXT_FIELDS = new Set(["input_text", "output_text", "prompt", "body"]);
const MAX_TEXT_LEN = 200;

function sanitize(entry: LogEntry): LogEntry {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (TEXT_FIELDS.has(k) && typeof v === "string" && v.length > MAX_TEXT_LEN) {
      out[k] = v.slice(0, MAX_TEXT_LEN);
    } else {
      out[k] = v;
    }
  }
  return out as LogEntry;
}

export function log(entry: LogEntry): void {
  console.log(JSON.stringify(sanitize(entry)));
}

export function logError(
  trace_id: string,
  agent: LogEntry["agent"],
  err: unknown
): void {
  const error =
    err instanceof Error ? err.message : typeof err === "string" ? err : "unknown error";
  log({ trace_id, agent, event: "error", error });
}
