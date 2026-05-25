export const TRACE_HEADER = "X-Trace-Id";

export function newTraceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: Math.random-based hex string in UUID v4 shape
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function readTraceFromHeaders(headers: Headers): string {
  return headers.get(TRACE_HEADER) ?? newTraceId();
}
