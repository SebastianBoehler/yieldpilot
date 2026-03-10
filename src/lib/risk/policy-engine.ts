import { subMinutes } from "date-fns";
import type { AgentRun, RebalanceDecision } from "@prisma/client";
import type { PolicyResult, RebalanceCandidate, StrategyPolicy } from "@/types/domain";

export function evaluatePolicy(params: {
  policy: StrategyPolicy;
  candidate: RebalanceCandidate;
  lastRun?: AgentRun | null;
  recentDecisions?: RebalanceDecision[];
}) {
  const { policy, candidate, lastRun, recentDecisions = [] } = params;
  const reasons: string[] = [];

  if (policy.emergencyPause) {
    reasons.push("Emergency pause is enabled.");
  }

  if (!policy.approvedChains.includes(candidate.destinationOpportunity.chainId)) {
    reasons.push("Destination chain is not whitelisted.");
  }

  if (!policy.approvedProtocols.includes(candidate.destinationOpportunity.protocol)) {
    reasons.push("Destination protocol is not whitelisted.");
  }

  if (!policy.approvedAssets.includes(candidate.destinationOpportunity.assetSymbol)) {
    reasons.push("Destination asset is not whitelisted.");
  }

  if (candidate.amountUsd > policy.maxRebalanceUsd || candidate.amountUsd > policy.maxTransactionUsd) {
    reasons.push("Rebalance amount exceeds policy cap.");
  }

  if (candidate.expectedNetBenefitUsd < policy.minNetBenefitUsd) {
    reasons.push("Projected net benefit is below the configured minimum.");
  }

  if (!Number.isFinite(candidate.routeCost.totalCostUsd) || candidate.routeCost.totalCostUsd < 0) {
    reasons.push("Route cost estimate is missing.");
  }

  if (policy.slippageBps > policy.maxSlippageBps) {
    reasons.push("Strategy slippage exceeds policy maximum.");
  }

  const cooldownThreshold = subMinutes(new Date(), policy.cooldownMinutes);
  const hasRecentExecution = recentDecisions.some((decision) => new Date(decision.createdAt) > cooldownThreshold);
  if (hasRecentExecution) {
    reasons.push("Strategy is inside cooldown window.");
  }

  if (lastRun?.completedAt && lastRun.completedAt > cooldownThreshold) {
    reasons.push("Recent agent loop already executed inside cooldown window.");
  }

  const trustedThreshold = policy.protocolAmountThresholds[candidate.destinationOpportunity.protocol] ?? 0;
  const isTrustedProtocol = policy.protocolPermanentApprovals.includes(candidate.destinationOpportunity.protocol);
  const eligibleForAutoApproval =
    policy.autoApproveTrustedProtocols &&
    isTrustedProtocol &&
    candidate.amountUsd <= trustedThreshold;

  return {
    allowed: reasons.length === 0,
    requiresHumanApproval: policy.mode === "HUMAN_APPROVAL" && !eligibleForAutoApproval,
    status:
      reasons.length > 0
        ? "BLOCKED"
        : policy.mode === "HUMAN_APPROVAL" && !eligibleForAutoApproval
          ? "QUEUED_FOR_APPROVAL"
          : "EXECUTING",
    reasons,
  } satisfies PolicyResult;
}
