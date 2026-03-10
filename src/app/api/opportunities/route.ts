import { NextResponse } from "next/server";
import { selectBestCandidate } from "@/lib/orchestration/rebalance";
import { buildDefaultStrategyPolicy } from "@/server/services/strategy-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet") ?? undefined;
  if (!wallet) {
    return NextResponse.json({
      positions: [],
      opportunities: [],
      candidates: [],
    });
  }

  const data = await selectBestCandidate({
    walletAddress: wallet as `0x${string}`,
    policy: buildDefaultStrategyPolicy(),
  });

  return NextResponse.json(data);
}
