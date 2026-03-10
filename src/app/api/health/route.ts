import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  if (env.AGENT_HEALTHCHECK_TOKEN && token !== env.AGENT_HEALTHCHECK_TOKEN) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    service: "yieldpilot-web",
    liveExecutionEnabled: env.LIVE_EXECUTION_ENABLED,
    smartAccountsEnabled: env.ENABLE_SMART_ACCOUNTS,
    gasSponsorshipEnabled: env.ENABLE_GAS_SPONSORSHIP,
    timestamp: new Date().toISOString(),
  });
}
