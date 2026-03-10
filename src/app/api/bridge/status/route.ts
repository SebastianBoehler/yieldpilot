import { NextResponse } from "next/server";
import { pollRouteStatus } from "@/lib/lifi/execution";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (!body.txHash || !body.bridge || !body.fromChain || !body.toChain) {
    return NextResponse.json({ error: "txHash, bridge, fromChain, and toChain are required" }, { status: 400 });
  }

  const status = await pollRouteStatus({
    txHash: body.txHash,
    bridge: body.bridge,
    fromChain: Number(body.fromChain),
    toChain: Number(body.toChain),
  });

  return NextResponse.json(status);
}
