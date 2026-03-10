import { NextResponse } from "next/server";
import { runAgentCycle } from "@/server/services/agent-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const walletAddress = body.walletAddress as string | undefined;
  const result = await runAgentCycle(walletAddress);
  return NextResponse.json(result, {
    status: result.runStatus === "FAILED" ? 500 : 200,
  });
}
