import { NextResponse } from "next/server";
import { checkGlobalBudget } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { readTraceFromHeaders, TRACE_HEADER } from "@/lib/trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const trace_id = readTraceFromHeaders(req.headers);
  log({ trace_id, agent: "budget", event: "request_start" });
  const state = await checkGlobalBudget();
  const res = NextResponse.json({
    used: state.used,
    cap: state.cap,
    resetAt: state.resetAt,
  });
  res.headers.set(TRACE_HEADER, trace_id);
  return res;
}
