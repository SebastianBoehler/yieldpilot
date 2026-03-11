import type { AgentCycleActionResult } from "@/agent/types";
import type { ExecutionPlan, RebalanceCandidate } from "@/types/domain";

export function buildExecutionPlanFromActionResults(
  actions: AgentCycleActionResult[],
  candidate?: RebalanceCandidate,
): ExecutionPlan | undefined {
  if (!candidate) {
    return undefined;
  }

  const txSteps = actions.flatMap((action) => action.plannedBundle?.txSteps ?? []);
  if (!txSteps.length) {
    return undefined;
  }

  return {
    routeId: candidate.routeCost.routeId,
    sourceChainId: candidate.sourcePosition.chainId,
    destinationChainId: candidate.destinationOpportunity.chainId,
    sourceProtocol: candidate.sourcePosition.protocolLabel,
    destinationProtocol: candidate.destinationOpportunity.protocolLabel,
    sourceAsset: candidate.sourcePosition.assetSymbol,
    destinationAsset: candidate.destinationOpportunity.assetSymbol,
    amount: candidate.amount.toString(),
    amountUsd: candidate.amountUsd,
    expectedApyDelta: candidate.expectedApyDelta,
    expectedNetBenefitUsd: candidate.expectedNetBenefitUsd,
    bridgeCostUsd: candidate.routeCost.bridgeCostUsd,
    gasCostUsd: candidate.routeCost.gasCostUsd + txSteps.reduce((sum, step) => sum + (step.estimatedGasUsd ?? 0), 0),
    slippageBps: Math.round(candidate.scoreBreakdown.slippagePenalty * 100),
    rationale: candidate.rationale,
    routeTool:
      actions.find((action) => action.request.protocol === "lifi")?.plannedBundle?.routeTool ??
      candidate.routeCost.tool,
    routeSummary: candidate.routeCost.routeLabel,
    txSteps,
  };
}
