import { NextResponse } from "next/server";
import { ensureUserStrategy, toStrategyPolicy } from "@/server/services/strategy-service";
import { selectBestCandidate } from "@/lib/orchestration/rebalance";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet") ?? undefined;
  const base = await ensureUserStrategy(wallet);

  if (!base) {
    return NextResponse.json({
      positions: [],
      opportunities: [],
      candidates: [],
    });
  }

  const data = await selectBestCandidate({
    walletAddress: base.user.walletAddress as `0x${string}`,
    policy: toStrategyPolicy(base.strategy),
  });

  return NextResponse.json(data);
}
