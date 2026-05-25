# ADR-0002: Rate-limit and budget counter store

## Status

Accepted (2026-05-25)

## Context

We need a low-latency, atomic counter store for per-IP rate limits and the global daily budget. The counters are hot (every request to `/api/agents/*` touches them) and short-lived (TTL up to 24 hours). The store must work in Vercel Edge Middleware, which constrains us to fetch-based clients (no raw TCP sockets).

Counters:
- `rl:ip:{ip}:{agent}:min:{minuteEpoch}` — minute window (TTL 65s)
- `rl:ip:{ip}:{agent}:day:{dayEpoch}` — day window (TTL 86405s)
- `budget:global:day:{dayEpoch}` — global daily budget (TTL 86405s)

## Decision

Use Vercel KV (Upstash Redis under the hood) accessed via `@vercel/kv`. Provision via the Vercel dashboard so the four `KV_*` env vars are injected into every environment. Wrap the client in `src/lib/kv.ts` so the rest of the code depends on a thin local export, not the vendor SDK directly. Counter functions fail open on KV read errors: a transient KV failure should not 429 every request. The global daily budget bounds the worst case if KV is genuinely down.

## Consequences

- Free tier covers 30,000 commands per day, more than enough for a 200 req/day demo budget.
- `INCR` + `EXPIRE` are atomic on Redis, so no race conditions on counter bumps.
- Edge runtime compatible (REST client over fetch).
- Vendor lock-in: switching off Vercel means re-implementing the wrapper. Mitigated by keeping the wrapper one file.
- Fail-open posture trades a short window of unmetered traffic for higher availability. Acceptable for a public demo where the global budget caps total damage anyway.

## Alternatives considered

- **Upstash Redis directly (skip `@vercel/kv`)**: identical capability, one extra env var to manage manually. Vercel KV picked for one-click provisioning and integrated env injection.
- **In-memory Map in middleware**: stateless across Edge invocations, useless for a global budget. Each Edge region would have its own counter.
- **Vercel Edge Config**: read-optimized, write happens at deploy time only. Unfit for runtime counters.
- **Cloudflare KV or Durable Objects**: would require leaving Vercel. Out of scope for v0.2.
