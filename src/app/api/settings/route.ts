import { NextResponse } from "next/server";
import { ensureUserStrategy, toStrategyPolicy, updateStrategySettings } from "@/server/services/strategy-service";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet") ?? undefined;
  const base = await ensureUserStrategy(wallet);

  if (!base) {
    return NextResponse.json(null);
  }

  return NextResponse.json({
    walletAddress: base.user.walletAddress,
    strategy: base.strategy,
    policy: toStrategyPolicy(base.strategy),
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const walletAddress = body.walletAddress as string | undefined;

  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const updated = await updateStrategySettings(walletAddress, body);
  return NextResponse.json({
    walletAddress: updated?.user.walletAddress,
    strategy: updated?.strategy,
    policy: updated?.strategy ? toStrategyPolicy(updated.strategy) : null,
  });
}
