import { NextResponse } from "next/server";
import { buildVirtualsManifest } from "@/lib/virtuals/manifest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    agents: buildVirtualsManifest(),
  });
}
