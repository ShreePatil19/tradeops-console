import { kv } from "@/lib/kv";

export const LIMITS = {
  IP_PER_MIN: 5,
  IP_PER_DAY: 30,
} as const;

export const GLOBAL_CAP = Number(process.env.DAILY_BUDGET ?? "200");

export type IpRateLimitState = {
  ok: boolean;
  reason?: "ip_minute" | "ip_day";
  remaining: { minute: number; day: number };
  retryAfter: number;
  reset: { minute: number; day: number };
};

export type GlobalBudgetState = {
  ok: boolean;
  used: number;
  cap: number;
  resetAt: number;
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

function globalKey(now: number) {
  return `budget:global:day:${Math.floor(now / 86400000)}`;
}

function nextMidnightUtc(now: number) {
  return (Math.floor(now / 86400000) + 1) * 86400;
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
