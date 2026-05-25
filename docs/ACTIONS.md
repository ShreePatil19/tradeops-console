# TradeOps Console — Actions Log

Running record of everything that has been done and everything queued to do. Updated continuously as work lands.

**Live:** [tradeops-console.vercel.app](https://tradeops-console.vercel.app)  
**Repo:** [github.com/ShreePatil19/tradeops-console](https://github.com/ShreePatil19/tradeops-console)  
**Current tag:** v0.2  
**Maintainer:** [@ShreePatil19](https://github.com/ShreePatil19)

---

## Status

| Layer | State |
|---|---|
| Homepage and 4 agent pages | live, render at all 5 routes |
| 4 API agent routes | live, work locally with key |
| Edge middleware (rate limit, budget, trace) | live, fail-open until Vercel KV provisioned |
| Eval harness | scaffold + fixtures + CI workflow live, GitHub secret pending |
| CI workflow (tsc, lint, build) | live, runs on every PR |
| ADRs (5 decisions) | committed under `docs/adr/` |
| Open GitHub issues | 0 |
| Closed GitHub issues | 65 |
| Unit tests | 75 / 75 green |

---

## Action history

### Phase 0 — Project bootstrap (2026-05-25)

Sessions before code: scaffold + first ship under deadline.

- Created `D:\Projects\tradeops-console\` with `plan.md` and `about-me.md` (both later gitignored as local-only context).
- Scaffolded Next.js 16 + Tailwind v4 + shadcn/ui (base-nova preset, neutral theme).
- Added 4 agent cards on homepage (placeholder linking off).
- First commit `0379362`, pushed to a new public GitHub repo at [ShreePatil19/tradeops-console](https://github.com/ShreePatil19/tradeops-console).
- Connected Vercel via the GitHub integration. Production aliased at [tradeops-console.vercel.app](https://tradeops-console.vercel.app). Auto-deploy on push to main.

### Phase 1 — Day 1 ship: 4 agents end to end (commit `8734172`)

- Built all 4 agents: Invoice Extractor, Inbox Triager, Compliance Pre-Check, Trade Q&A.
- Shared streaming UI primitives: `AgentShell`, `StreamOutput`, `ToolCallCard`.
- AI SDK v6 + `@ai-sdk/anthropic` (later swapped) + `useChat` on the client.
- Each agent has typed tools (zod schemas) and structured outputs.

### Phase 2 — Provider swap to free tier (commit `965505e`)

- Switched from Anthropic Claude to Google Gemini 2.5 Flash for the public demo.
- Free tier (15 RPM, 1500 RPD) covers the demo budget without a credit card.
- `src/lib/anthropic.ts` renamed to `src/lib/model.ts`, all 4 routes re-pointed.

### Phase 3 — Homepage rebuild (commit `0379362` patch on main)

- Removed "Day 1 of 7", status badges, "Honesty contract" framing per user feedback (page was reading as pathetic; recruiter audience).
- Made agent cards link through to `/agents/<slug>`.

### Phase 4 — v0.2 milestone setup

- Created 8 epic GitHub issues + 34 child issues + 12 labels + 1 milestone (`v0.2 production-ready demo`).
- Wrote E1 (rate-limiting) implementation plan at `docs/superpowers/plans/2026-05-25-edge-protection.md` — 11 TDD-shaped tasks, full code in every step, threat model at the top.

### Phase 5 — Parallel subagent batches

Used `superpowers:dispatching-parallel-agents` + `superpowers:subagent-driven-development` skills. Worktree isolation unsupported in this harness, so subagents ran sequentially on disjoint file sets.

**BATCH 1 (3 subagents):**
- **E6 homepage narrative + diagram** (commits `9224f3c`, `8fe0a8a`, `cababc8`): problem statement under hero, "How it works" 3-step inline SVG section, README rewrite.
- **E8 CI/CD + ADRs + templates** (commits `441996c`, `5f360ad`, `4c219e2`, `7760700`): `.github/workflows/ci.yml`, PR template, 3 issue templates, ADRs 0001/0003/0004.
- **E2 eval harness scaffold** (commits `911f570`, `251adf8`, `9014098`): `evals/` dir with types, client, runner, scorer; starter cases per agent; `pnpm eval` script.

**E1 (main thread, TDD):**
- Vercel KV client, vitest scaffold, rate-limit module (per-IP min/day + global daily budget) with mocked-KV tests, edge middleware on `/api/agents/*`, `/api/budget` readout, ADR-002, counter bumps in 4 routes (commits `2da9718`, `b153fd2`, `d6072da`, `cbefaae`, `771c4c5`).

**BATCH 2 (sequential):**
- **E3 observability** (commits `ec62d83`, `bb4ed3b`, `2c74984`, `95bc015`): `src/lib/log.ts` (structured JSON-line logger), `src/lib/trace.ts` (UUID trace IDs + propagation), middleware injects `X-Trace-Id`, all 4 routes instrumented with request_start / tool_call / request_end / error events, UI shows trace_id in error block with copy-to-clipboard button.
- **E4 guardrails** (commits `e7d9a9e`, `1f45129`, `f3e78ec`, `e4fdc99`): `src/lib/guards.ts` with `INPUT_CAPS` (4 KB email, 10 MB / 20 page PDF, 500 B counterparty, 1 KB question), 413 enforcement in middleware, 5-pattern prompt-injection regex with KV penalty key, PII redaction (emails → `[email]`, phones → `[phone]`, IPs hashed via djb2), Q&A citation validator. 29 unit tests for guards + 13 for log redaction.

**BATCH 3 (sequential):**
- **E5 UX polish** (commits `8ce80a7`, `41f70e3`, `60d23a4`): `QuotaIndicator` chip in `AgentShell` header (polls `/api/budget` every 30s when page visible, color-coded green/amber/red), structured error cards (`RateLimitCard` with countdown, `BudgetExhaustedCard`, `BlockedCard`, `PayloadTooLargeCard`, `GenericErrorCard` with trace_id), 3-line `animate-pulse` skeleton, per-agent `EmptyState`.
- **E7 cost and performance** (commits `a45624a`, `8df19d8`, `64e5378`): `src/lib/cache.ts` (SHA-256 input hashing, 1h TTL in KV), enabled on Q&A (text-only replay, tool calls not replayed), `MAX_OUTPUT_TOKENS` per agent in `src/lib/model.ts` applied to all 4 streamText calls. 16 cache tests.

### Phase 6 — Real fixtures + CI close-out

Subagent for the eval fixtures (commits `e17f405`, `059c8e7`, `b9f8995`, `c582ab9`, `48d0c36`):
- **#38 Invoice:** 3 synthetic text fixtures with ground-truth line items, 80% recall scorer. Real PDFs noted as follow-up.
- **#39 Inbox:** 10 labeled emails (3 RFQ, 2 order, 2 complaint, 2 spam, 1 info), 90% exact-category scorer.
- **#40 Compliance:** 15 cases (5 known hits, 10 synthetic clears), 100% hit recall + ≤10% false positive scorer.
- **#41 Trade Q&A:** 10 questions tagged with expected corpus chunk IDs, citation validity + recall scorer.
- **#42 Eval CI:** `.github/workflows/eval.yml` triggers on PR touching `evals/`, `src/app/api/agents/`, or `src/lib/`. Needs repo secret `GOOGLE_GENERATIVE_AI_API_KEY`.

### Phase 7 — Close-out

- 42 v0.2 issues closed with completion notes citing the landing commits.
- 23 orphaned issues from the failed first creation pass (broken bodies) closed as duplicates of the clean #24-#65 batch.
- Tag `v0.2` pushed to origin.
- First proper PR opened ([#66](https://github.com/ShreePatil19/tradeops-console/pull/66)) for the ACTIONS log itself, demonstrating the feature-branch flow. Squash-merged as commit `d9836f1`.

### Phase 8 — v0.3 polish (in flight)

- **OG image** ([PR #67](https://github.com/ShreePatil19/tradeops-console/pull/67)): `src/app/opengraph-image.tsx` using `next/og` `ImageResponse`, 1200x630 with TradeOps branding, agent pills, and the URL. `layout.tsx` metadata extended with `openGraph` block and `twitter.card: summary_large_image` so LinkedIn / Twitter previews render the large card.
- **CI hygiene** ([PR #68 in flight](https://github.com/ShreePatil19/tradeops-console/tree/chore/ci-hygiene)): added `concurrency` block on both workflows (cancel in-flight on new push), `paths-ignore` on `ci.yml` for docs-only changes (saves runner minutes), and added a `test` job that runs `pnpm test` so the 75 unit tests are gated.

---

## Pending actions (in priority order)

### Awaiting maintainer

| Action | Where | Why | Reference |
|---|---|---|---|
| Provision Vercel KV instance named `tradeops-console-kv` | Vercel dashboard → Storage → Create | Rate limiting + global budget + cache all fail-open silently until KV exists. Free tier covers 30,000 commands/day. | ADR-002 |
| Add `GOOGLE_GENERATIVE_AI_API_KEY` repo secret | GitHub repo → Settings → Secrets and variables → Actions | `eval.yml` workflow cannot run against the live API on PRs without it. Use a separate test key with its own daily budget. | #42 |
| Branch protection on `main` | GitHub repo → Settings → Branches | Without it, anyone with write can push directly. CI status check should be required. | nice-to-have, post-v0.2 |

### v0.3 backlog (not yet ticketed)

| Idea | Notes |
|---|---|
| Real PDF fixtures for Invoice Extractor evals | Need 5 synthetic PDFs with handwritten / partial / stamped variants. Could generate via pdfkit or use public-domain samples. |
| Extend response cache to inbox/compliance/qa | Pattern is in `cache.ts` with `CACHE_ENABLED` flag per agent. Tool-call replay needs an SSE serialiser. |
| Axiom or Logfire observability sink | Module is pluggable (see ADR-0004). Wire when traffic justifies dashboards. |
| Agent-specific quota chip variants | Right now QuotaIndicator shows global budget. Could also show per-IP remaining today. |
| `vercel env add` automation script | One command to add the key to all 3 envs from a local file. |
| Hero GIF for README | Record a 10-second demo of Q&A streaming with citations. |

---

## How to update this file

- After every meaningful change, append a line under the matching phase (or create a new phase header).
- Move items from "Pending actions" to a phase entry when they land.
- Keep commit SHAs in monospace and link to the GitHub commit URL when adding new entries: `[`abc1234`](https://github.com/ShreePatil19/tradeops-console/commit/abc1234)`.
- Status table at the top is the source of truth; keep it current as features ship.
- This file is committed; do not put secrets, API keys, or anything that should not appear in public commit history.
