import { NextResponse } from "next/server";
import { getDashboardSnapshot } from "@/server/services/strategy-service";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet") ?? undefined;
  const snapshot = await getDashboardSnapshot(wallet);
  return NextResponse.json(snapshot);
}
