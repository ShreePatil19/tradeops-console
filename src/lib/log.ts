import { createHash } from "node:crypto";

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

// PII redaction patterns (Issue #49)
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// E.164 global (+61...) and AU local mobile (04xx xxxxxxx / 04xxxxxxxx)
const PHONE_RE = /(\+[1-9]\d{6,14}|0[45]\d{8})/g;

// Rough IPv4 pattern; covers dotted-quad addresses.
const IPV4_RE = /\b(\d{1,3}\.){3}\d{1,3}\b/g;

// Fields whose values are treated as IP addresses and hash-pseudonymised.
const IP_FIELD_NAMES = new Set(["ip", "x-forwarded-for", "x_forwarded_for", "real_ip", "client_ip"]);

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 8);
}

/**
 * Redact PII from a string value: replaces emails, phones, and IPv4 addresses.
 * Never logs the original value; returns a safe version.
 */
export function redactString(value: string): string {
  return value
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[phone]")
    .replace(IPV4_RE, (ip) => `[ip:${hashIp(ip)}]`);
}

/**
 * Walk an entry and apply PII redaction to string values.
 * IP-field names get hash-pseudonymised; all other string fields get email/phone/IP replacement.
 */
function redact(entry: LogEntry): LogEntry {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (typeof v === "string") {
      const fieldLower = k.toLowerCase();
      if (IP_FIELD_NAMES.has(fieldLower)) {
        // Pseudonymise: hash-first-8 of each comma-separated IP.
        out[k] = v
          .split(",")
          .map((part) => `[ip:${hashIp(part.trim())}]`)
          .join(",");
      } else {
        out[k] = redactString(v);
      }
    } else {
      out[k] = v;
    }
  }
  return out as LogEntry;
}

function sanitize(entry: LogEntry): LogEntry {
  // First truncate long text fields, then redact PII.
  const truncated: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (TEXT_FIELDS.has(k) && typeof v === "string" && v.length > MAX_TEXT_LEN) {
      truncated[k] = v.slice(0, MAX_TEXT_LEN);
    } else {
      truncated[k] = v;
    }
  }
  return redact(truncated as LogEntry);
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
