import { NextResponse, type NextRequest } from "next/server";
import {
  checkRateLimit,
  checkGlobalBudget,
  formatHeaders,
} from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { readTraceFromHeaders, TRACE_HEADER } from "@/lib/trace";

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
  const parts = pathname.split("/").filter(Boolean);
  return parts[2] ?? "unknown";
}

export async function middleware(req: NextRequest) {
  const ip = getClientIp(req);
  const agent = getAgentSlug(req.nextUrl.pathname);
  const trace_id = readTraceFromHeaders(req.headers);

  const ipState = await checkRateLimit(ip, agent);
  if (!ipState.ok) {
    log({ trace_id, agent: "middleware", event: "rate_limit_hit", status: 429, reason: ipState.reason });
    const res = NextResponse.json(
      {
        error: "rate_limited",
        reason: ipState.reason,
        retryAfter: ipState.retryAfter,
      },
      { status: 429, headers: formatHeaders(ipState) }
    );
    res.headers.set(TRACE_HEADER, trace_id);
    return res;
  }

  const globalState = await checkGlobalBudget();
  if (!globalState.ok) {
    log({ trace_id, agent: "middleware", event: "rate_limit_hit", status: 429, reason: "global_budget_exhausted" });
    const res = NextResponse.json(
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
    res.headers.set(TRACE_HEADER, trace_id);
    return res;
  }

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set(TRACE_HEADER, trace_id);

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set(TRACE_HEADER, trace_id);
  for (const [k, v] of Object.entries(formatHeaders(ipState))) {
    res.headers.set(k, v);
  }
  return res;
}
