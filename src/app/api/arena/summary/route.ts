import { NextResponse } from "next/server";
import { getArenaSnapshot } from "@/server/services/arena-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function GET() {
  const snapshot = await getArenaSnapshot();
  return NextResponse.json(snapshot);
}
