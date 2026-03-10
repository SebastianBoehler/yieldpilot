import { NextResponse } from "next/server";
import { buildDecision } from "@/lib/orchestration/rebalance";
import { buildDefaultStrategyPolicy } from "@/server/services/strategy-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const walletAddress = body.walletAddress as string | undefined;

  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const decision = await buildDecision({
    walletAddress: walletAddress as `0x${string}`,
    policy: buildDefaultStrategyPolicy(),
  });

  return NextResponse.json(decision);
}
