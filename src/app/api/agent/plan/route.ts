import { NextResponse } from "next/server";
import { runYieldStrategyModule } from "@/agent/strategies/yield-agent";
import type { AgentCycleActionResult } from "@/agent/types";
import { getProtocolAdapter } from "@/protocols/adapter-registry";
import type { ExecutionPlan } from "@/types/domain";
import { buildDefaultStrategyPolicy, ensureUserStrategy, toStrategyPolicy } from "@/server/services/strategy-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

function buildExecutionPlanFromActions(actions: AgentCycleActionResult[], strategy: Awaited<ReturnType<typeof runYieldStrategyModule>>): ExecutionPlan | undefined {
  if (!strategy.candidate) {
    return undefined;
  }

  const txSteps = actions.flatMap((action) => action.plannedBundle?.txSteps ?? []);
  if (!txSteps.length) {
    return undefined;
  }

  return {
    routeId: strategy.candidate.routeCost.routeId,
    sourceChainId: strategy.candidate.sourcePosition.chainId,
    destinationChainId: strategy.candidate.destinationOpportunity.chainId,
    sourceProtocol: strategy.candidate.sourcePosition.protocolLabel,
    destinationProtocol: strategy.candidate.destinationOpportunity.protocolLabel,
    sourceAsset: strategy.candidate.sourcePosition.assetSymbol,
    destinationAsset: strategy.candidate.destinationOpportunity.assetSymbol,
    amount: strategy.candidate.amount.toString(),
    amountUsd: strategy.candidate.amountUsd,
    expectedApyDelta: strategy.candidate.expectedApyDelta,
    expectedNetBenefitUsd: strategy.candidate.expectedNetBenefitUsd,
    bridgeCostUsd: strategy.candidate.routeCost.bridgeCostUsd,
    gasCostUsd: strategy.candidate.routeCost.gasCostUsd + txSteps.reduce((sum, step) => sum + (step.estimatedGasUsd ?? 0), 0),
    slippageBps: Math.round(strategy.candidate.scoreBreakdown.slippagePenalty * 100),
    rationale: strategy.candidate.rationale,
    routeTool: strategy.candidate.routeCost.tool,
    routeSummary: strategy.candidate.routeCost.routeLabel,
    txSteps,
  };
}

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
  const executionPlan = buildExecutionPlanFromActions(actions, strategy);

  return NextResponse.json({
    candidate: strategy.candidate,
    policyResult: {
      allowed: Boolean(executionPlan),
      reasons: [],
    },
    executionPlan,
  });
}
