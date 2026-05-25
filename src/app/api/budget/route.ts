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
