import { NextResponse } from "next/server";
import { getResearchResourcePayload } from "@/server/services/research-service";
import type { VirtualsAgentKey, VirtualsResourceKey } from "@/types/virtuals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TRADE_PLANNER_RESOURCES = new Set<VirtualsResourceKey>(["supported_chains", "methodology"]);

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      resource: string;
    }>;
  },
) {
  const { resource } = await context.params;
  const url = new URL(request.url);
  const agent = (url.searchParams.get("agent") ?? "yieldpilot-research") as VirtualsAgentKey;

  if (!["latest_signals", "tracked_whales", "recent_launches", "supported_chains", "methodology", "signal_history"].includes(resource)) {
    return NextResponse.json({ error: "Unknown resource." }, { status: 404 });
  }

  if (agent === "yieldpilot-trade-planner" && !TRADE_PLANNER_RESOURCES.has(resource as VirtualsResourceKey)) {
    return NextResponse.json({ error: "Resource is not exposed by the trade planner agent." }, { status: 404 });
  }

  const payload = await getResearchResourcePayload(agent, resource as VirtualsResourceKey);
  return NextResponse.json(payload);
}
