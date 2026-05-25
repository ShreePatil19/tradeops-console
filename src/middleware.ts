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
