import type { RebalanceCandidate, StrategyPolicy } from "@/types/domain";
import type { AgentActionRequest, StrategyModuleResult } from "@/agent/types";
import { selectBestCandidate } from "@/lib/orchestration/rebalance";

function buildYieldActions(candidate: RebalanceCandidate): AgentActionRequest[] {
  const actions: AgentActionRequest[] = [];
  const route = candidate.routeCost.route as { steps?: unknown[] } | undefined;

  if (candidate.sourcePosition.protocol !== "wallet") {
    actions.push({
      strategyKey: "yield-agent",
      title: `Withdraw ${candidate.sourcePosition.assetSymbol} from ${candidate.sourcePosition.protocolLabel}`,
      kind: "lend_withdraw",
      protocol: candidate.sourcePosition.protocol,
      chainId: candidate.sourcePosition.chainId,
      accountAddress: candidate.sourcePosition.walletAddress,
      assetSymbol: candidate.sourcePosition.assetSymbol,
      amount: candidate.amount.toString(),
      amountUsd: candidate.amountUsd,
      receiver: candidate.sourcePosition.walletAddress,
      metadata: {
        atomicAmount: candidate.amount.toString(),
        assetAddress: candidate.sourcePosition.assetAddress,
        positionId: candidate.sourcePosition.id,
      },
    });
  }

  if (route?.steps?.length) {
    actions.push({
      strategyKey: "yield-agent",
      title: route.steps.length > 0 && candidate.sourcePosition.chainId !== candidate.destinationOpportunity.chainId
        ? `Bridge and swap ${candidate.sourcePosition.assetSymbol} into ${candidate.destinationOpportunity.assetSymbol}`
        : `Swap ${candidate.sourcePosition.assetSymbol} into ${candidate.destinationOpportunity.assetSymbol}`,
      kind: candidate.sourcePosition.chainId === candidate.destinationOpportunity.chainId ? "swap" : "bridge_swap",
      protocol: "lifi",
      chainId: candidate.sourcePosition.chainId,
      accountAddress: candidate.sourcePosition.walletAddress,
      assetSymbol: candidate.sourcePosition.assetSymbol,
      amount: candidate.amount.toString(),
      amountUsd: candidate.amountUsd,
      receiver: candidate.destinationOpportunity.chainId === candidate.sourcePosition.chainId
        ? candidate.sourcePosition.walletAddress
        : candidate.sourcePosition.walletAddress,
      slippageBps: Math.round(candidate.scoreBreakdown.slippagePenalty * 100),
      metadata: {
        route: candidate.routeCost.route,
        fromTokenAddress: candidate.sourcePosition.assetAddress,
        toTokenAddress: candidate.destinationOpportunity.assetAddress,
        fromAmount: candidate.amount.toString(),
        toChainId: candidate.destinationOpportunity.chainId,
      },
    });
  }

  actions.push({
    strategyKey: "yield-agent",
    title: `Deposit into ${candidate.destinationOpportunity.protocolLabel} on ${candidate.destinationOpportunity.chainLabel}`,
    kind: "lend_deposit",
    protocol: candidate.destinationOpportunity.protocol,
    chainId: candidate.destinationOpportunity.chainId,
    accountAddress: candidate.sourcePosition.walletAddress,
    assetSymbol: candidate.destinationOpportunity.assetSymbol,
    amount: candidate.amount.toString(),
    amountUsd: candidate.amountUsd,
    receiver: candidate.sourcePosition.walletAddress,
    metadata: {
      atomicAmount: candidate.amount.toString(),
      assetAddress: candidate.destinationOpportunity.assetAddress,
      opportunityId: candidate.destinationOpportunity.id,
      poolAddress: candidate.destinationOpportunity.metadata.poolAddress,
      routeId: candidate.routeCost.routeId,
    },
  });

  return actions;
}

export async function runYieldStrategyModule(params: {
  walletAddress: `0x${string}`;
  policy: StrategyPolicy;
}): Promise<
  StrategyModuleResult & {
    positions: Awaited<ReturnType<typeof selectBestCandidate>>["positions"];
    opportunities: Awaited<ReturnType<typeof selectBestCandidate>>["opportunities"];
    candidate?: RebalanceCandidate;
  }
> {
  const { positions, opportunities, candidates } = await selectBestCandidate({
    walletAddress: params.walletAddress,
    policy: params.policy,
  });

  const candidate = candidates[0];
  const actions = candidate ? buildYieldActions(candidate) : [];

  return {
    strategyKey: "yield-agent",
    summary: candidate
      ? `Yield strategy identified ${actions.length} executable actions toward ${candidate.destinationOpportunity.protocolLabel} on ${candidate.destinationOpportunity.chainLabel}.`
      : "Yield strategy found no rebalance candidate that cleared the current thresholds.",
    candidateCount: candidates.length,
    actions,
    metadata: {
      topCandidateId: candidate?.destinationOpportunity.id,
      expectedNetBenefitUsd: candidate?.expectedNetBenefitUsd,
    },
    positions,
    opportunities,
    candidate,
  };
}
