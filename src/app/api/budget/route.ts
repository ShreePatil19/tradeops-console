import { NextResponse } from "next/server";
import {
  checkGlobalBudget,
  getIpDayCount,
  LIMITS,
} from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { readTraceFromHeaders, TRACE_HEADER } from "@/lib/trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_AGENTS = new Set<string>([
  "invoice",
  "inbox",
  "compliance",
  "qa",
]);

type AgentBudgetBlock = {
  slug: string;
  perIpUsed: number;
  perIpCap: number;
  perIpResetAt: number;
};

type BudgetResponse = {
  used: number;
  cap: number;
  resetAt: number;
  agent?: AgentBudgetBlock;
};

function nextMidnightUtcSeconds(now: number): number {
  return (Math.floor(now / 86400000) + 1) * 86400;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() ?? "127.0.0.1";
}

export async function GET(req: Request) {
  const trace_id = readTraceFromHeaders(req.headers);
  log({ trace_id, agent: "budget", event: "request_start" });

  const url = new URL(req.url);
  const agentParam = url.searchParams.get("agent");

  if (agentParam !== null && !VALID_AGENTS.has(agentParam)) {
    const errRes = NextResponse.json(
      {
        error: "invalid_agent",
        message: `agent must be one of ${[...VALID_AGENTS].join(", ")}`,
      },
      { status: 400 }
    );
    errRes.headers.set(TRACE_HEADER, trace_id);
    return errRes;
  }

  const state = await checkGlobalBudget();
  const body: BudgetResponse = {
    used: state.used,
    cap: state.cap,
    resetAt: state.resetAt,
  };

  if (agentParam) {
    const ip = clientIp(req);
    const perIpUsed = await getIpDayCount(ip, agentParam);
    body.agent = {
      slug: agentParam,
      perIpUsed,
      perIpCap: LIMITS.IP_PER_DAY,
      perIpResetAt: nextMidnightUtcSeconds(Date.now()),
    };
  }

  const res = NextResponse.json(body);
  res.headers.set(TRACE_HEADER, trace_id);
  return res;
}
