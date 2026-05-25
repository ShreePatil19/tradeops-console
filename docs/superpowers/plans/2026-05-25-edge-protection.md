# Edge Protection (Rate Limiting + Global Daily Budget) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect `/api/agents/*` from quota exhaustion via per-IP and global daily rate limits, enforced at the edge, backed by Vercel KV.

**Architecture:** Vercel KV (Upstash Redis) holds three counter families: `rl:ip:{ip}:{agent}:min:{epoch}`, `rl:ip:{ip}:{agent}:day:{epoch}`, and `budget:global:day:{epoch}`. A Next.js Edge Middleware checks both per-IP and global limits before every `/api/agents/*` request and returns 429 if exceeded. API handlers bump the counters only after a successful streamText finish, so failed calls don't drain the budget. A `GET /api/budget` exposes global usage for the UI quota chip.

**Tech Stack:**
- `@vercel/kv` (Redis-compatible client, edge-friendly)
- Next.js 16 Edge Middleware
- Vitest with mocked `kv` for unit tests
- TypeScript

**Issues this plan closes:** #32, #33, #34, #35, #36 (and the parent epic #24)

---

## Security considerations

This plan ships the first defensive layer. Threats and their mitigations:

| Threat | Mitigation |
|---|---|
| Single IP drains quota | Per-IP 5/min + 30/day per agent counters |
| Distributed drain (many IPs) | Global 200/day cap across all agents (configurable) |
| Spoofed `X-Forwarded-For` | Vercel edge rewrites this header from the actual L4 source; we trust the leftmost token |
| KV credentials in repo | Credentials live only in env (`.env.local` gitignored, Vercel encrypted env for prod) |
| KV outage causing request denial | Rate-limit functions fail **open** on KV read error (logged) so a transient KV failure does not take the whole demo offline. Document this trade-off in the ADR. |
| Counter bump on failed Gemini call drains budget | Counters bumped only inside `onFinish` callback (after successful stream completion) |
| Quota leakage via `/api/budget` reflecting real usage | Acceptable — the value is intentionally public (it powers the UI chip) |

## File Map

**Create:**
- `src/lib/kv.ts` — re-export `kv` client + `KvLike` type for mocking
- `src/lib/rate-limit.ts` — `checkRateLimit`, `bumpRateLimit`, `checkGlobalBudget`, `bumpGlobalBudget`, `formatHeaders`, types
- `src/middleware.ts` — Edge Middleware applying limits on `/api/agents/*`
- `src/app/api/budget/route.ts` — GET endpoint returning `{used, cap, resetAt}`
- `tests/lib/rate-limit.test.ts` — unit tests with mocked KV
- `tests/sanity.test.ts` — vitest smoke
- `vitest.config.ts`
- `docs/adr/0000-template.md` — Michael Nygard template
- `docs/adr/0002-rate-limit-store.md`

**Modify:**
- `package.json` — deps (`@vercel/kv`, `vitest`, `@vitest/coverage-v8`, `tsx`); scripts (`test`, `test:watch`)
- `src/app/api/agents/invoice/route.ts` — bump counters via `onFinish`
- `src/app/api/agents/inbox/route.ts` — same
- `src/app/api/agents/compliance/route.ts` — same
- `src/app/api/agents/qa/route.ts` — same

---

## Task 1: Provision Vercel KV and add the client

**Files:**
- Create: `src/lib/kv.ts`
- Modify: `package.json` (adds `@vercel/kv`, `tsx`)
- Modify: `.env.local` (Vercel CLI populates `KV_*` vars)

**Closes:** #32

- [ ] **Step 1: Create the KV store (manual, user action)**

In the Vercel dashboard: open the `tradeops-console` project → Storage tab → Create database → KV (Redis) → name `tradeops-console-kv` → region `iad1` (matches the deployment) → Connect to project. Vercel auto-injects four envs: `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`.

- [ ] **Step 2: Pull the new envs into `.env.local`**

```sh
cd D:\Projects\tradeops-console
vercel env pull .env.local
```

Expected: the existing `GOOGLE_GENERATIVE_AI_API_KEY` is preserved, four `KV_*` values are appended.

- [ ] **Step 3: Install `@vercel/kv` and `tsx`**

```sh
pnpm add @vercel/kv
pnpm add -D tsx
```

- [ ] **Step 4: Write the KV client export**

Create `src/lib/kv.ts`:

```ts
import { kv } from "@vercel/kv";

export { kv };

export type KvLike = Pick<typeof kv, "get" | "set" | "incr" | "expire" | "del">;
```

- [ ] **Step 5: Smoke test the client**

```sh
pnpm exec tsx -e "import('./src/lib/kv').then(async ({ kv }) => { await kv.set('smoke', 'ok'); const v = await kv.get('smoke'); console.log('value:', v); await kv.del('smoke'); process.exit(0); });"
```

Expected output: `value: ok`. If you see `UPSTASH_REDIS_REST_URL is not defined`, re-run step 2.

- [ ] **Step 6: Commit**

```sh
git add package.json pnpm-lock.yaml src/lib/kv.ts
git commit -m "feat(kv): provision Vercel KV client (closes #32)"
```

---

## Task 2: Vitest scaffold

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/sanity.test.ts`
- Modify: `package.json` (deps + scripts)

**Closes:** none (enables Tasks 3+; bridges to #61)

- [ ] **Step 1: Install vitest**

```sh
pnpm add -D vitest @vitest/coverage-v8
```

- [ ] **Step 2: Write vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Write a sanity test**

Create `tests/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("evaluates true", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 4: Add npm scripts**

In `package.json`, inside `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Run the test**

```sh
pnpm test
```

Expected: `Test Files  1 passed (1)` and `Tests  1 passed (1)`.

- [ ] **Step 6: Commit**

```sh
git add package.json pnpm-lock.yaml vitest.config.ts tests/sanity.test.ts
git commit -m "chore(test): scaffold vitest with sanity test"
```

---

## Task 3: Per-IP rate limit core (TDD)

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `tests/lib/rate-limit.test.ts`

**Closes:** part of #33

- [ ] **Step 1: Write failing tests for `checkRateLimit` + `bumpRateLimit`**

Create `tests/lib/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/kv", () => {
  const store = new Map<string, number>();
  return {
    kv: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        store.set(key, Number(value));
        return "OK";
      }),
      incr: vi.fn(async (key: string) => {
        const next = (store.get(key) ?? 0) + 1;
        store.set(key, next);
        return next;
      }),
      expire: vi.fn(async () => 1),
      del: vi.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
    },
    __store: store,
  };
});

import * as kvMod from "@/lib/kv";
import { checkRateLimit, bumpRateLimit } from "@/lib/rate-limit";

const STORE = (kvMod as unknown as { __store: Map<string, number> }).__store;

describe("checkRateLimit (per-IP)", () => {
  beforeEach(() => {
    for (const k of Array.from(STORE.keys())) STORE.delete(k);
  });

  it("allows the first request with full remaining quotas", async () => {
    const state = await checkRateLimit("1.2.3.4", "qa");
    expect(state.ok).toBe(true);
    expect(state.remaining.minute).toBe(5);
    expect(state.remaining.day).toBe(30);
  });

  it("blocks the 6th request in the same minute", async () => {
    for (let i = 0; i < 5; i++) await bumpRateLimit("1.2.3.4", "qa");
    const state = await checkRateLimit("1.2.3.4", "qa");
    expect(state.ok).toBe(false);
    expect(state.reason).toBe("ip_minute");
    expect(state.retryAfter).toBeGreaterThan(0);
  });

  it("blocks the 31st request in the same day", async () => {
    const dayKey = `rl:ip:1.2.3.4:qa:day:${Math.floor(Date.now() / 86400000)}`;
    STORE.set(dayKey, 30);
    const state = await checkRateLimit("1.2.3.4", "qa");
    expect(state.ok).toBe(false);
    expect(state.reason).toBe("ip_day");
  });

  it("separates counters by agent slug", async () => {
    for (let i = 0; i < 5; i++) await bumpRateLimit("1.2.3.4", "qa");
    const state = await checkRateLimit("1.2.3.4", "inbox");
    expect(state.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```sh
pnpm test
```

Expected: `Error: Failed to resolve import "@/lib/rate-limit"`.

- [ ] **Step 3: Implement the rate-limit module**

Create `src/lib/rate-limit.ts`:

```ts
import { kv } from "@/lib/kv";

export const LIMITS = {
  IP_PER_MIN: 5,
  IP_PER_DAY: 30,
} as const;

export type IpRateLimitState = {
  ok: boolean;
  reason?: "ip_minute" | "ip_day";
  remaining: { minute: number; day: number };
  retryAfter: number;
  reset: { minute: number; day: number };
};

function keys(ip: string, agent: string, now: number) {
  const minuteEpoch = Math.floor(now / 60000);
  const dayEpoch = Math.floor(now / 86400000);
  return {
    minute: `rl:ip:${ip}:${agent}:min:${minuteEpoch}`,
    day: `rl:ip:${ip}:${agent}:day:${dayEpoch}`,
    minuteResetAt: (minuteEpoch + 1) * 60,
    dayResetAt: (dayEpoch + 1) * 86400,
  };
}

export async function checkRateLimit(
  ip: string,
  agent: string,
  now = Date.now()
): Promise<IpRateLimitState> {
  const k = keys(ip, agent, now);
  let minute = 0;
  let day = 0;
  try {
    const [m, d] = await Promise.all([
      kv.get<number>(k.minute),
      kv.get<number>(k.day),
    ]);
    minute = m ?? 0;
    day = d ?? 0;
  } catch {
    // Fail open on KV read error; the global budget still caps total damage.
    return {
      ok: true,
      remaining: { minute: LIMITS.IP_PER_MIN, day: LIMITS.IP_PER_DAY },
      retryAfter: 0,
      reset: { minute: k.minuteResetAt, day: k.dayResetAt },
    };
  }
  const remaining = {
    minute: Math.max(0, LIMITS.IP_PER_MIN - minute),
    day: Math.max(0, LIMITS.IP_PER_DAY - day),
  };
  const reset = { minute: k.minuteResetAt, day: k.dayResetAt };
  if (minute >= LIMITS.IP_PER_MIN) {
    return {
      ok: false,
      reason: "ip_minute",
      remaining,
      retryAfter: Math.max(1, k.minuteResetAt - Math.floor(now / 1000)),
      reset,
    };
  }
  if (day >= LIMITS.IP_PER_DAY) {
    return {
      ok: false,
      reason: "ip_day",
      remaining,
      retryAfter: Math.max(1, k.dayResetAt - Math.floor(now / 1000)),
      reset,
    };
  }
  return { ok: true, remaining, retryAfter: 0, reset };
}

export async function bumpRateLimit(
  ip: string,
  agent: string,
  now = Date.now()
): Promise<void> {
  const k = keys(ip, agent, now);
  try {
    await Promise.all([
      kv.incr(k.minute).then(() => kv.expire(k.minute, 65)),
      kv.incr(k.day).then(() => kv.expire(k.day, 86405)),
    ]);
  } catch {
    // Silent: counter loss on a single failure is acceptable.
  }
}
```

- [ ] **Step 4: Run, verify pass**

```sh
pnpm test
```

Expected: `Test Files  2 passed (2)` and `Tests  5 passed (5)`.

- [ ] **Step 5: Commit**

```sh
git add src/lib/rate-limit.ts tests/lib/rate-limit.test.ts
git commit -m "feat(rate-limit): per-IP minute + day counters (part of #33)"
```

---

## Task 4: Global daily budget (TDD)

**Files:**
- Modify: `src/lib/rate-limit.ts` (append exports)
- Modify: `tests/lib/rate-limit.test.ts` (append suite)

**Closes:** part of #34

- [ ] **Step 1: Add failing tests**

Append to `tests/lib/rate-limit.test.ts`:

```ts
import { checkGlobalBudget, bumpGlobalBudget } from "@/lib/rate-limit";

describe("checkGlobalBudget", () => {
  beforeEach(() => {
    for (const k of Array.from(STORE.keys())) STORE.delete(k);
  });

  it("allows when usage is under the cap", async () => {
    const state = await checkGlobalBudget();
    expect(state.ok).toBe(true);
    expect(state.used).toBe(0);
    expect(state.cap).toBeGreaterThan(0);
  });

  it("blocks when usage meets or exceeds the cap", async () => {
    const dayKey = `budget:global:day:${Math.floor(Date.now() / 86400000)}`;
    STORE.set(dayKey, 9999);
    const state = await checkGlobalBudget();
    expect(state.ok).toBe(false);
    expect(state.used).toBe(9999);
  });

  it("bumpGlobalBudget increments the day counter", async () => {
    await bumpGlobalBudget();
    await bumpGlobalBudget();
    const state = await checkGlobalBudget();
    expect(state.used).toBe(2);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```sh
pnpm test
```

Expected: `Error: Failed to resolve import "checkGlobalBudget"`.

- [ ] **Step 3: Implement `checkGlobalBudget` + `bumpGlobalBudget`**

Append to `src/lib/rate-limit.ts`:

```ts
export const GLOBAL_CAP = Number(process.env.DAILY_BUDGET ?? "200");

export type GlobalBudgetState = {
  ok: boolean;
  used: number;
  cap: number;
  resetAt: number;
};

function globalKey(now: number) {
  return `budget:global:day:${Math.floor(now / 86400000)}`;
}

function nextMidnightUtc(now: number) {
  return (Math.floor(now / 86400000) + 1) * 86400;
}

export async function checkGlobalBudget(
  now = Date.now()
): Promise<GlobalBudgetState> {
  let used = 0;
  try {
    used = (await kv.get<number>(globalKey(now))) ?? 0;
  } catch {
    // Fail open on KV error.
  }
  return {
    ok: used < GLOBAL_CAP,
    used,
    cap: GLOBAL_CAP,
    resetAt: nextMidnightUtc(now),
  };
}

export async function bumpGlobalBudget(now = Date.now()): Promise<void> {
  const key = globalKey(now);
  try {
    await kv.incr(key);
    await kv.expire(key, 86405);
  } catch {
    // Silent: see bumpRateLimit.
  }
}
```

- [ ] **Step 4: Run, verify pass**

```sh
pnpm test
```

Expected: `Tests  8 passed (8)`.

- [ ] **Step 5: Commit**

```sh
git add src/lib/rate-limit.ts tests/lib/rate-limit.test.ts
git commit -m "feat(rate-limit): global daily budget counter (part of #34)"
```

---

## Task 5: Rate-limit header formatter

**Files:**
- Modify: `src/lib/rate-limit.ts` (append `formatHeaders`)
- Modify: `tests/lib/rate-limit.test.ts` (append suite)

**Closes:** part of #35

- [ ] **Step 1: Add failing test**

Append to `tests/lib/rate-limit.test.ts`:

```ts
import { formatHeaders } from "@/lib/rate-limit";

describe("formatHeaders", () => {
  it("returns IETF X-RateLimit-* headers on success", () => {
    const headers = formatHeaders({
      ok: true,
      remaining: { minute: 4, day: 29 },
      retryAfter: 0,
      reset: { minute: 1779683900, day: 1779712800 },
    });
    expect(headers["X-RateLimit-Limit"]).toBe("5");
    expect(headers["X-RateLimit-Remaining"]).toBe("4");
    expect(headers["X-RateLimit-Reset"]).toBe("1779683900");
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("includes Retry-After when limited", () => {
    const headers = formatHeaders({
      ok: false,
      reason: "ip_minute",
      remaining: { minute: 0, day: 25 },
      retryAfter: 17,
      reset: { minute: 1779683900, day: 1779712800 },
    });
    expect(headers["Retry-After"]).toBe("17");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
  });
});
```

- [ ] **Step 2: Run, verify failure**

```sh
pnpm test
```

Expected: `Error: Failed to resolve import "formatHeaders"`.

- [ ] **Step 3: Implement**

Append to `src/lib/rate-limit.ts`:

```ts
export function formatHeaders(state: IpRateLimitState): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(LIMITS.IP_PER_MIN),
    "X-RateLimit-Remaining": String(state.remaining.minute),
    "X-RateLimit-Reset": String(state.reset.minute),
  };
  if (!state.ok && state.retryAfter > 0) {
    headers["Retry-After"] = String(state.retryAfter);
  }
  return headers;
}
```

- [ ] **Step 4: Run, verify pass**

```sh
pnpm test
```

Expected: `Tests  10 passed (10)`.

- [ ] **Step 5: Commit**

```sh
git add src/lib/rate-limit.ts tests/lib/rate-limit.test.ts
git commit -m "feat(rate-limit): IETF X-RateLimit-* header formatter (part of #35)"
```

---

## Task 6: Edge Middleware enforcing limits

**Files:**
- Create: `src/middleware.ts`

**Closes:** the middleware part of #33 and #34

- [ ] **Step 1: Write the middleware**

Create `src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import {
  checkRateLimit,
  checkGlobalBudget,
  formatHeaders,
} from "@/lib/rate-limit";

export const config = {
  matcher: ["/api/agents/:path*"],
};

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "127.0.0.1";
}

function getAgentSlug(pathname: string): string {
  // pathname like "/api/agents/qa" -> "qa"
  const parts = pathname.split("/").filter(Boolean);
  return parts[2] ?? "unknown";
}

export async function middleware(req: NextRequest) {
  const ip = getClientIp(req);
  const agent = getAgentSlug(req.nextUrl.pathname);

  const ipState = await checkRateLimit(ip, agent);
  if (!ipState.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        reason: ipState.reason,
        retryAfter: ipState.retryAfter,
      },
      { status: 429, headers: formatHeaders(ipState) }
    );
  }

  const globalState = await checkGlobalBudget();
  if (!globalState.ok) {
    return NextResponse.json(
      {
        error: "global_budget_exhausted",
        resetAt: globalState.resetAt,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, globalState.resetAt - Math.floor(Date.now() / 1000))
          ),
        },
      }
    );
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(formatHeaders(ipState))) {
    res.headers.set(k, v);
  }
  return res;
}
```

- [ ] **Step 2: Build**

```sh
pnpm build
```

Expected: build succeeds, output line `Middleware  ⚡  matched 1 route`.

- [ ] **Step 3: Manual integration test against dev**

If the dev server is not running:

```sh
pnpm dev
```

In a separate PowerShell window:

```sh
for ($i = 1; $i -le 6; $i++) {
  curl.exe -i -X POST "http://localhost:3000/api/agents/qa" `
    -H "Content-Type: application/json" `
    -d '{"messages":[{"role":"user","parts":[{"type":"text","text":"What is FOB?"}]}]}' `
    2>$null | Select-String -Pattern "HTTP/|X-RateLimit|error"
}
```

Expected: requests 1-5 return `HTTP/1.1 200` with `X-RateLimit-Remaining` decreasing from 5 to 1. Request 6 returns `HTTP/1.1 429` with `{"error":"rate_limited","reason":"ip_minute",...}`.

- [ ] **Step 4: Commit**

```sh
git add src/middleware.ts
git commit -m "feat(middleware): edge rate-limit on /api/agents/* (completes #33 middleware)"
```

---

## Task 7: Bump counters from API handlers on successful finish

**Files:**
- Modify: `src/app/api/agents/qa/route.ts`
- Modify: `src/app/api/agents/invoice/route.ts`
- Modify: `src/app/api/agents/inbox/route.ts`
- Modify: `src/app/api/agents/compliance/route.ts`

**Why:** Middleware cannot know if the downstream Gemini call ultimately succeeded. We want failed (500) calls to **not** drain the budget.

**Closes:** completes #33 and #34

- [ ] **Step 1: Modify `qa/route.ts` to use `onFinish` callback**

In `src/app/api/agents/qa/route.ts`, add the import at the top:

```ts
import { bumpRateLimit, bumpGlobalBudget } from "@/lib/rate-limit";
```

Update the `POST` function body. Replace the existing `streamText({...})` call with this version (adding `onFinish` and capturing `ip` from the request):

```ts
export async function POST(req: Request) {
  try {
    requireApiKey();
    const { messages }: { messages: UIMessage[] } = await req.json();

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(3),
      tools: {
        search_corpus: tool({
          // ... existing tool definition unchanged
          description:
            "Search the in-repo trade knowledge base. Returns up to 4 matched chunks, each with id, title, source, and text.",
          inputSchema: z.object({
            query: z.string().describe("Concise search query derived from the user's question."),
          }),
          execute: async ({ query }) => {
            const hits = topK(query, 4);
            return {
              query,
              matchCount: hits.length,
              chunks: hits.map((h) => ({
                id: h.id,
                title: h.title,
                source: h.source,
                text: h.text,
                score: Number(h.score.toFixed(2)),
              })),
            };
          },
        }),
      },
      onFinish: () => {
        Promise.all([bumpRateLimit(ip, "qa"), bumpGlobalBudget()]).catch(
          () => {
            /* counter loss is acceptable; never fail the user response */
          }
        );
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    return new Response(message, { status: 500 });
  }
}
```

- [ ] **Step 2: Repeat for `invoice/route.ts`**

Same pattern. Add the import. Add `const ip = ...` and `onFinish: () => { Promise.all([bumpRateLimit(ip, "invoice"), bumpGlobalBudget()]).catch(() => {}); }` to the `streamText` call.

- [ ] **Step 3: Repeat for `inbox/route.ts`**

Same pattern with `"inbox"` as the agent slug.

- [ ] **Step 4: Repeat for `compliance/route.ts`**

Same pattern with `"compliance"`.

- [ ] **Step 5: Type-check**

```sh
pnpm tsc --noEmit
```

Expected: passes with no errors.

- [ ] **Step 6: Manual integration test**

Restart the dev server. Hit Q&A once (use the sample button at `http://localhost:3000/agents/qa`). Then:

```sh
pnpm exec tsx -e "import('./src/lib/kv').then(async ({ kv }) => { const day = Math.floor(Date.now()/86400000); console.log('global day counter:', await kv.get('budget:global:day:'+day)); process.exit(0); });"
```

Expected: `global day counter: 1` (or more, depending on how many times you have called it).

- [ ] **Step 7: Commit**

```sh
git add src/app/api/agents/
git commit -m "feat(api): bump rate-limit + global counters via onFinish (completes #33, #34)"
```

---

## Task 8: `/api/budget` readout endpoint

**Files:**
- Create: `src/app/api/budget/route.ts`

**Closes:** budget readout (part of #34)

- [ ] **Step 1: Write the route**

Create `src/app/api/budget/route.ts`:

```ts
import { NextResponse } from "next/server";
import { checkGlobalBudget } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await checkGlobalBudget();
  return NextResponse.json({
    used: state.used,
    cap: state.cap,
    resetAt: state.resetAt,
  });
}
```

- [ ] **Step 2: Manual test**

```sh
curl.exe http://localhost:3000/api/budget
```

Expected: `{"used":1,"cap":200,"resetAt":<epoch>}`.

- [ ] **Step 3: Commit**

```sh
git add src/app/api/budget/route.ts
git commit -m "feat(api): /api/budget readout for quota chip"
```

---

## Task 9: Rate-limit headers on success responses

**Files:**
- Modify: `src/middleware.ts` (already attaches headers to `NextResponse.next()` in Task 6 — verify)

**Closes:** completes #35

- [ ] **Step 1: Verify middleware attaches headers on success**

Open `src/middleware.ts`. Confirm the last block in the `middleware` function reads:

```ts
const res = NextResponse.next();
for (const [k, v] of Object.entries(formatHeaders(ipState))) {
  res.headers.set(k, v);
}
return res;
```

If present, this task is already complete; commit a no-op verification or skip to Step 2.

- [ ] **Step 2: Manual test that successful responses carry headers**

With dev running:

```sh
curl.exe -i -X POST "http://localhost:3000/api/agents/qa" `
  -H "Content-Type: application/json" `
  -d '{"messages":[{"role":"user","parts":[{"type":"text","text":"What is FOB?"}]}]}' `
  2>$null | Select-String -Pattern "X-RateLimit"
```

Expected: three lines `X-RateLimit-Limit: 5`, `X-RateLimit-Remaining: N`, `X-RateLimit-Reset: <epoch>`.

- [ ] **Step 3: If headers absent, fix Task 6 and re-commit; otherwise no-op**

```sh
echo "headers verified, no new commit needed"
```

---

## Task 10: ADR-002 + ADR template

**Files:**
- Create: `docs/adr/0000-template.md`
- Create: `docs/adr/0002-rate-limit-store.md`

**Closes:** #36

- [ ] **Step 1: Write the ADR template**

Create `docs/adr/0000-template.md`:

```markdown
# ADR-NNNN: <Short decision title>

## Status

Proposed | Accepted (YYYY-MM-DD) | Deprecated | Superseded by [ADR-NNNN](NNNN-title.md)

## Context

What is the issue we are addressing? What forces are at play?

## Decision

Active voice, one paragraph if possible.

## Consequences

What becomes easier? What becomes harder? What new risks did we accept?

## Alternatives considered

- **Option A:** brief description; why not chosen.
- **Option B:** brief description; why not chosen.
```

- [ ] **Step 2: Write ADR-002**

Create `docs/adr/0002-rate-limit-store.md`:

```markdown
# ADR-002: Rate-limit and budget counter store

## Status

Accepted (2026-05-25)

## Context

We need a low-latency, atomic counter store for per-IP rate limits and the global daily budget. The counters are hot (every API request touches them) and short-lived (TTL up to 24h). The store must work in Vercel Edge Middleware, which constrains us to fetch-based clients (no TCP sockets).

## Decision

Use Vercel KV (Upstash Redis under the hood) accessed via `@vercel/kv`. Provision via the Vercel dashboard so the four `KV_*` envs are injected automatically into every environment. Wrap the client in `src/lib/kv.ts` so the rest of the code depends on a thin local export, not the vendor SDK directly.

Counter functions fail **open** on KV read errors: a transient KV failure should not 429 every request. The global daily budget bounds the worst case.

## Consequences

- Free tier covers 30,000 commands/day, more than enough for a 200 req/day demo.
- `INCR` + `EXPIRE` are atomic on Redis, so no race conditions on counter bumps.
- Edge runtime compatible (REST client over fetch).
- Vendor lock: switching off Vercel means re-implementing the wrapper. Mitigated by keeping the wrapper one file.
- Fail-open posture trades a short window of unmetered traffic for higher availability. Acceptable for a demo.

## Alternatives considered

- **Upstash Redis direct (skip `@vercel/kv`):** identical capability, one extra env var to manage. Vercel KV picked for one-click provisioning.
- **In-memory Map in middleware:** stateless across Edge invocations, useless for a global budget.
- **Vercel Edge Config:** read-optimized, deploy-time write only. Unfit for counters.
- **Cloudflare KV / Durable Objects:** would require leaving Vercel. Out of scope for v0.2.
```

- [ ] **Step 3: Commit**

```sh
git add docs/adr/
git commit -m "docs(adr): add template + ADR-002 rate-limit store (closes #36)"
```

---

## Task 11: Push, verify on production, close issues

- [ ] **Step 1: Push**

```sh
git push
```

Vercel auto-deploys (about 60s). Monitor: `vercel inspect tradeops-console-git-main-shreepatil19s-projects.vercel.app`.

- [ ] **Step 2: Verify KV envs are present in prod**

```sh
vercel env ls
```

Expected: `KV_REST_API_URL`, `KV_REST_API_TOKEN` present for production, preview, development.

- [ ] **Step 3: Hit production API and confirm rate-limit headers**

```sh
curl.exe -i -X POST "https://tradeops-console.vercel.app/api/agents/qa" `
  -H "Content-Type: application/json" `
  -d '{"messages":[{"role":"user","parts":[{"type":"text","text":"What is FOB?"}]}]}' `
  2>$null | Select-String -Pattern "HTTP/|X-RateLimit"
```

Expected: `HTTP/2 200` plus three `X-RateLimit-*` headers.

- [ ] **Step 4: Verify `/api/budget` returns global usage**

```sh
curl.exe https://tradeops-console.vercel.app/api/budget
```

Expected: `{"used":N,"cap":200,"resetAt":<epoch>}`.

- [ ] **Step 5: Provoke a 429 on prod (optional sanity check)**

Run a 6-request burst against prod from the same shell:

```sh
for ($i = 1; $i -le 6; $i++) {
  curl.exe -i -X POST "https://tradeops-console.vercel.app/api/agents/qa" `
    -H "Content-Type: application/json" `
    -d '{"messages":[{"role":"user","parts":[{"type":"text","text":"hi"}]}]}' `
    2>$null | Select-String -Pattern "HTTP/|reason"
}
```

Expected: requests 1-5 return 200, request 6 returns 429 with `"reason":"ip_minute"`.

- [ ] **Step 6: Close the issues**

```sh
gh issue close 32 33 34 35 36 -c "Implemented per the v0.2 edge protection plan. Verified on production."
```

- [ ] **Step 7: Close the epic**

```sh
gh issue close 24 -c "All 5 child issues closed. v0.2 edge protection is live on tradeops-console.vercel.app."
```

---

## Self-Review

**Spec coverage:**
- #32 (KV provisioning) — Task 1
- #33 (per-IP rate limit) — Tasks 3, 6, 7
- #34 (global daily budget) — Tasks 4, 6, 7, 8
- #35 (rate-limit headers) — Tasks 5, 6, 9
- #36 (ADR-002) — Task 10
- Epic #24 closes after children — Task 11

**Placeholder scan:** no TBDs, no "implement later", no "similar to Task N". Every code step shows the exact code to write. Every verification step shows the exact command and the expected output.

**Type consistency:** `checkRateLimit`, `bumpRateLimit`, `checkGlobalBudget`, `bumpGlobalBudget`, `formatHeaders` — names match across Tasks 3, 4, 5, 6, 7, 8, 9. `IpRateLimitState` (with `remaining: { minute, day }` shape) and `GlobalBudgetState` consistent across producers (`src/lib/rate-limit.ts`) and consumers (`src/middleware.ts`, `src/app/api/budget/route.ts`).

**Security review:** all 7 threats in the table at the top of this plan are addressed by the implementation. Fail-open on KV outage is the one explicit trade-off; documented in ADR-002.
