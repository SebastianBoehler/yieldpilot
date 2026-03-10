import { NextResponse } from "next/server";
import { getLiveDashboardSnapshot } from "@/server/services/live-portfolio-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet") ?? undefined;
  const walletType = url.searchParams.get("walletType") === "solana" ? "solana" : "evm";
  const snapshot = await getLiveDashboardSnapshot({
    walletAddress: wallet,
    walletType,
  });
  return NextResponse.json(snapshot);
}
