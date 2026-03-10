import { NextResponse } from "next/server";
import { getLiveDashboardSnapshot } from "@/server/services/live-portfolio-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet") ?? undefined;
  const snapshot = await getLiveDashboardSnapshot(wallet);
  return NextResponse.json(snapshot);
}
