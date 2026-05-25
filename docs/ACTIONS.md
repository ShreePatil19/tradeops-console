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
| CI workflow (tsc, lint, build, test) | live, runs on every PR; auto-merge enabled on PRs that pass |
| ADRs (5 decisions) | committed under `docs/adr/` |
| Open GitHub issues | 0 |
| Open GitHub PRs | 0 |
| Closed GitHub issues | 65 |
| PRs merged in v0.3 polish phase | 12 (#66 to #73 plus the agent-routes, eval-scorer, env-sync, and PDF-fixture passes) |
| Unit tests | 258 / 258 green across 25 test files |

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

- **OG image** ([PR #67](https://github.com/ShreePatil19/tradeops-console/pull/67)): `src/app/opengraph-image.tsx` using `next/og` `ImageResponse`, 1200x630 with TradeOps branding, agent pills, and the URL. `layout.tsx` metadata extended with `openGraph` block and `twitter.card: summary_large_image` so LinkedIn / Twitter previews render the large card. Build registers the new `/opengraph-image` route.
- **CI hygiene** ([PR #68](https://github.com/ShreePatil19/tradeops-console/pull/68), merged as `ca5330b`): `concurrency` block on both workflows (cancel in-flight on new push), `paths-ignore` on `ci.yml` for docs-only changes (saves runner minutes), and a `test` job that runs `pnpm test` so all unit tests are gated on every PR.
- **Lint fix + test expansion** ([PR #69](https://github.com/ShreePatil19/tradeops-console/pull/69), merged as `96eb37d`): fixed `react-hooks/set-state-in-effect` in `QuotaIndicator`, two unused-var warnings in evals; added 21 new unit tests (`trace.test.ts`, `sanctions.test.ts`); added `eval.yml` secret-presence guard so the job skips gracefully when `GOOGLE_GENERATIVE_AI_API_KEY` is missing. Test count: 96.
- **Component + integration test layer** ([PR #70](https://github.com/ShreePatil19/tradeops-console/pull/70), merged as `e0dd961`): added `@testing-library/react` + `jsdom` to dev-deps, per-file `// @vitest-environment jsdom` directive for component tests. 7 new tests for `QuotaIndicator` (loading skeleton, success render, green/amber/red threshold styling, error dash, reset-time tooltip). 6 new integration tests for `/api/budget` (JSON shape, counter reflection, resetAt within 24h, trace-id echo). Test count: 109.
- **Model + StreamOutput tests** ([PR #71](https://github.com/ShreePatil19/tradeops-console/pull/71), merged as `fdb9458`): 6 new tests for `src/lib/model.ts`, 13 new tests for `StreamOutput`. Test count: 128.
- **Middleware + ToolCallCard tests** ([PR #72](https://github.com/ShreePatil19/tradeops-console/pull/72), merged as `cd6458a`): 13 integration tests for `src/middleware.ts`, 10 component tests for `ToolCallCard`. `vi.hoisted` pattern for mock fns referenced from `vi.mock` factories. Test count: 151.
- **EmptyState + AgentShell + QA scorer tests** ([PR #73](https://github.com/ShreePatil19/tradeops-console/pull/73), merged as `1821d43`): 5 tests for `EmptyState`, 5 tests for `AgentShell` (with mocked `QuotaIndicator`), 7 tests for `scoreQa`. Test count: 168.
- **Agent route smoke tests** ([PR #75](https://github.com/ShreePatil19/tradeops-console/pull/75), merged as `9940de9`): 33 new integration tests across `tests/integration/agent-{invoice,inbox,compliance,qa}.test.ts`. Mocked the `ai` package (`streamText`, `tool`, `convertToModelMessages`, `stepCountIs`, `createUIMessageStream`, `createUIMessageStreamResponse`) plus `@/lib/model`, `@/lib/rate-limit`, `@/lib/log`, `@/lib/guards`, `@/lib/cache`, and `@/lib/sanctions` so the tests never call Gemini. Each route verifies: 500 on missing API key, 200 streaming response with `X-Trace-Id`, inbound trace echo, `streamText` args (system prompt fragment, token cap, registered tool names), `request_start` log shape, each tool's `execute` return shape, and `onFinish` counter bumps. QA additionally covers `guardInput` blocking the request with 429 `injection_attempt`, cache-hit replay with `X-Cache: HIT` skipping `streamText`, cache-miss path with `X-Cache: MISS` persisting via `setCachedResponse`, citation-validator logging of unknown chunk IDs, and the `CACHE_ENABLED.qa = false` plain path. Test count: 201.
- **Eval scorer tests** ([PR #76](https://github.com/ShreePatil19/tradeops-console/pull/76), merged as `8fd203c`): 30 new unit tests across `tests/evals/{invoice,inbox,compliance}-scorer.test.ts`. Invoice (10 tests): starter pass, no-expected pass, missing tool call fail, full recall, alternative description fields (`name`), `items` array fallback, lineTotal >1% drift fail, lineTotal within 1% pass, exact-80% threshold pass, sub-80% fail with missing-item list. Inbox (9 tests): starter pass, no-expected pass, missing classify_email fail, missing-category-field fail, invalid-enum fail, exact match pass, mismatch fail, `classification` fallback field, uppercase-to-lowercase normalisation. Compliance (11 tests): starter pass, no-expected pass, hit detected, hit missed, hit with no VERDICT line, clear pass, clear inconclusive, clear false-positive, clear with no VERDICT line, lowercase `verdict:` parsing, `VERDICT: sanctioned` synonym. Test count: 231.
- **vercel env sync script** ([PR #77](https://github.com/ShreePatil19/tradeops-console/pull/77), merged as `6577ede`): `scripts/vercel-env-sync.ts` plus `pnpm env:sync` reads a local env file and pushes each KEY=VALUE to one or more of Vercel's three environments in a single call. Pure helpers `parseEnvFile` (comments, blanks, quote stripping, single equals semantics) and `buildCommandPlan` (key x env fan-out with env-name validation) covered by 15 new unit tests in `tests/scripts/vercel-env-sync.test.ts`. CLI flags: `--file=PATH`, `--env=development,preview,production`, `--dry-run`. Values are piped to `vercel env add NAME ENV` via stdin (never embedded in argv or a shell string). Reviewed by the security-reviewer subagent; switched the `child_process.spawn` call to no-shell mode on the recommendation. `scripts/README.md` documents the usage. Test count: 246.
- **Invoice PDF fixtures**: `evals/invoice/fixtures/build.ts` plus `pnpm fixtures:invoice` generates five deterministic PDFs covering the variation a real ops desk sees: `01-clean`, `02-partial`, `03-stamped` (red `RECEIVED` overlay at 12 degrees, semi-transparent), `04-handwritten` (italic note in blue), `05-multipage` (18 line items across 2 pages with a continued header). Built with `pdf-lib` and `StandardFonts` (Helvetica/HelveticaBold/TimesRomanItalic). Output is byte-deterministic: creation and modification dates pinned to `2024-01-01T00:00:00Z`, producer string explicit, `useObjectStreams: false` for stable object IDs. CLI flag `--check` verifies on-disk fixtures match generator output (works through `pnpm fixtures:invoice -- --check`). 12 new unit tests in `tests/evals/invoice-fixtures.test.ts` cover magic header, page count per variant, supplier and invoice-number metadata embedding, variant-specific keyword tags, byte-equality determinism, the FIXTURE_SPECS shape, and `buildAllFixtures` round-trip. `evals/invoice/fixtures/README.md` documents each variant and the deferred follow-up (route + eval client multipart wiring). Test count: 258.

### Phase 8 summary

12 PRs auto-merged in sequence (`#66` through the PDF-fixture pass), all via the feature-branch + push + CI + `gh pr merge --auto --squash` flow. Test count grew from 75 to 258 (+183). Zero PRs ever merged with a red check.

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
| Wire PDF fixtures into the live route + eval client | Extend `/api/agents/invoice` to accept `multipart/form-data` with a `file` part, pass the PDF to Gemini as a file attachment, and update `evals/client.ts` to POST as multipart when a case has a `fixture` field. The five PDFs already exist under `evals/invoice/fixtures/`. |
| Extend response cache to inbox/compliance/qa | Pattern is in `cache.ts` with `CACHE_ENABLED` flag per agent. Tool-call replay needs an SSE serialiser. |
| Axiom or Logfire observability sink | Module is pluggable (see ADR-0004). Wire when traffic justifies dashboards. |
| Agent-specific quota chip variants | Right now QuotaIndicator shows global budget. Could also show per-IP remaining today. |
| Hero GIF for README | Record a 10-second demo of Q&A streaming with citations. |

---

## How to update this file

- After every meaningful change, append a line under the matching phase (or create a new phase header).
- Move items from "Pending actions" to a phase entry when they land.
- Keep commit SHAs in monospace and link to the GitHub commit URL when adding new entries: `[`abc1234`](https://github.com/ShreePatil19/tradeops-console/commit/abc1234)`.
- Status table at the top is the source of truth; keep it current as features ship.
- This file is committed; do not put secrets, API keys, or anything that should not appear in public commit history.
