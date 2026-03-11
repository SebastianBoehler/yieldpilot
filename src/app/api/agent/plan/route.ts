import { NextResponse } from "next/server";
import { runYieldStrategyModule } from "@/agent/strategies/yield-agent";
import type { AgentCycleActionResult } from "@/agent/types";
import { getProtocolAdapter } from "@/protocols/adapter-registry";
import { buildDefaultStrategyPolicy, ensureUserStrategy, toStrategyPolicy } from "@/server/services/strategy-service";
import { buildExecutionPlanFromActionResults } from "@/server/services/trade-plan-serializer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const walletAddress = body.walletAddress as string | undefined;

  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const base = await ensureUserStrategy(walletAddress);
  const policy = base ? toStrategyPolicy(base.strategy) : buildDefaultStrategyPolicy();
  const strategy = await runYieldStrategyModule({
    walletAddress: walletAddress as `0x${string}`,
    policy,
  });
  const actions = await Promise.all(
    strategy.actions.map(async (action) => {
      const adapter = getProtocolAdapter(action.protocol);
      const bundle = await adapter.executeAction(action, {
        walletAddress: walletAddress as `0x${string}`,
        executionMode: "dry-run",
      });

      return {
        request: action,
        plannedBundle: bundle,
      } satisfies AgentCycleActionResult;
    }),
  );
  const executionPlan = buildExecutionPlanFromActionResults(actions, strategy.candidate);

  return NextResponse.json({
    candidate: strategy.candidate,
    policyResult: {
      allowed: Boolean(executionPlan),
      reasons: [],
    },
    executionPlan,
  });
}
