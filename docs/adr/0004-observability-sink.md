# ADR-0004: Observability sink for agent call traces

## Status

Accepted (2026-05-25)

## Context

Every agent invocation must produce a structured trail that captures:

- Which agent ran, with which model and input size.
- Latency, token counts, and finish reason.
- Any quota-relevant metadata (RPM headroom, quota-reset timestamps).

This data is needed for debugging during development and for quota analysis once the
demo is live. The project runs on Vercel; cost must be zero for v0.2.

## Decision

Emit structured JSON lines to stdout. Vercel ingests process stdout as structured logs,
making every agent trace queryable via the Vercel dashboard log viewer at zero added cost.
The logging module uses a thin interface so an external sink (Axiom, Logfire, or an
OpenTelemetry collector) can be wired in by swapping a single adapter.

## Consequences

**Positive:**

- Zero cost; no third-party account needed for v0.2.
- JSON lines are grep-friendly locally and parseable by any log aggregator later.
- Pluggable interface means migration to a paid sink requires no changes to agent code.

**Negative / trade-offs:**

- Vercel log retention is limited (typically 1 to 7 days depending on plan); no long-term
  storage without a paid sink.
- Query capability is basic: full-text search only, no structured field filtering, until
  Axiom or similar is connected.

## Alternatives considered

| Option | Reason rejected |
|--------|-----------------|
| Axiom | Deferred until traffic volume justifies the cost; can drop in via the pluggable adapter. |
| Logfire (Pydantic) | Same deferral rationale as Axiom; primary SDK is Python, adding friction for a TypeScript project. |
| OpenTelemetry direct export | Heavyweight setup (collector sidecar or OTLP endpoint) is out of scope for a single-developer v0.2 demo. |
