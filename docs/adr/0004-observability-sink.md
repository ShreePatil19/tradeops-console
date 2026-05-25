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
| Logfire (Pydantic) | Primary SDK is Python; OpenTelemetry-native expects span shape rather than raw JSON events, which would add friction to a TypeScript event-style logger. |
| OpenTelemetry direct export | Heavyweight setup (collector sidecar or OTLP endpoint) is out of scope for a single-developer demo. |
| Better Stack (Logtail) | Good UI for live tailing, weaker query language than Axiom. Saved as a future swap-target via the pluggable adapter. |

## Update 2026-05-25: Axiom sink wired in

The pluggable adapter is now populated by `src/lib/axiom.ts`. Behaviour:

- `log()` continues to write a JSON line to stdout (no change). After the stdout write it fires `shipToAxiom(sanitized)` in the background.
- `shipToAxiom` is a no-op when either `AXIOM_TOKEN` or `AXIOM_DATASET` is missing (typical local dev), so existing local workflows are unchanged.
- When both env vars are set, each event is shipped via a single `POST https://api.axiom.co/v1/datasets/<dataset>/ingest` with `Authorization: Bearer <token>` and a JSON array body of one event. `_time` defaults to `new Date().toISOString()`.
- `AXIOM_HOST` overrides the default host (`api.axiom.co`) for regional routing.
- All network failures (`fetch` rejection, non-2xx response) are swallowed. Log shipping never blocks the user request.

Batching is intentionally not implemented yet. At v0.3 traffic volumes the one-event-per-POST cost is negligible; revisit when monthly call counts exceed Axiom's free-tier ingest budget.
