import { HOLDING_PERIOD_DAYS } from "@/lib/config/constants";
import type { RebalanceCandidate, RouteCostEstimate, ScoreBreakdown, StrategyPolicy, YieldOpportunity } from "@/types/domain";
import { clamp } from "@/lib/utils/number";

export function calculateOpportunityScore(params: {
  opportunity: YieldOpportunity;
  routeCost: RouteCostEstimate;
  amountUsd: number;
  slippageBps: number;
  riskProfile: StrategyPolicy["riskProfile"];
}) {
  const { opportunity, routeCost, amountUsd, slippageBps, riskProfile } = params;
  const bridgeCostPenalty = amountUsd > 0 ? (routeCost.bridgeCostUsd / amountUsd) * 100 : 0;
  const gasPenalty = amountUsd > 0 ? (routeCost.gasCostUsd / amountUsd) * 100 : 0;
  const slippagePenalty = slippageBps / 100;
  const liquidityBonus = clamp(opportunity.tvlUsd / 1_000_000, 0, 3);
  const chainPreference =
    riskProfile === "CONSERVATIVE" ? (opportunity.chainKey === "arbitrum" ? 1.2 : 0.5) :
    riskProfile === "AGGRESSIVE" ? 0.2 :
    0.8;

  const riskPenalty = opportunity.riskPenalty + (riskProfile === "CONSERVATIVE" ? 1.4 : riskProfile === "AGGRESSIVE" ? 0.4 : 0.8);
  const finalScore = opportunity.apy - riskPenalty - bridgeCostPenalty - gasPenalty - slippagePenalty + liquidityBonus + chainPreference;

  return {
    rawApy: opportunity.apy,
    riskPenalty,
    bridgeCostPenalty,
    gasPenalty,
    slippagePenalty,
    liquidityBonus,
    chainPreference,
    finalScore,
  } satisfies ScoreBreakdown;
}

export function calculateExpectedNetBenefit(params: {
  currentApy: number;
  targetApy: number;
  amountUsd: number;
  routeCostUsd: number;
}) {
  const annualizedImprovement = (params.targetApy - params.currentApy) / 100;
  const projectedGainUsd = params.amountUsd * annualizedImprovement * (HOLDING_PERIOD_DAYS / 365);
  return projectedGainUsd - params.routeCostUsd;
}

export function rankCandidates(params: {
  currentApy: number;
  amountUsd: number;
  opportunities: YieldOpportunity[];
  routeCostByOpportunity: Map<string, RouteCostEstimate>;
  policy: StrategyPolicy;
  sourcePosition: RebalanceCandidate["sourcePosition"];
}): RebalanceCandidate[] {
  const { opportunities, routeCostByOpportunity, amountUsd, currentApy, policy, sourcePosition } = params;

  return opportunities
    .map((opportunity) => {
      const routeCost = routeCostByOpportunity.get(opportunity.id);
      if (!routeCost) {
        return undefined;
      }

      const scoreBreakdown = calculateOpportunityScore({
        opportunity,
        routeCost,
        amountUsd,
        slippageBps: policy.slippageBps,
        riskProfile: policy.riskProfile,
      });

      const expectedNetBenefitUsd = calculateExpectedNetBenefit({
        currentApy,
        targetApy: opportunity.apy,
        amountUsd,
        routeCostUsd: routeCost.totalCostUsd,
      });

      return {
        sourcePosition,
        destinationOpportunity: opportunity,
        amount: BigInt(sourcePosition.balance),
        amountUsd,
        expectedApyDelta: opportunity.apy - currentApy,
        expectedNetBenefitUsd,
        routeCost,
        scoreBreakdown,
        rationale: `Move capital from ${sourcePosition.chainLabel} ${sourcePosition.protocolLabel} into ${opportunity.chainLabel} ${opportunity.protocolLabel} to capture a ${(
          opportunity.apy - currentApy
        ).toFixed(2)}% APY improvement over a ${HOLDING_PERIOD_DAYS}-day holding window.`,
      } satisfies RebalanceCandidate;
    })
    .filter((candidate): candidate is RebalanceCandidate => Boolean(candidate))
    .sort((left, right) => right.scoreBreakdown.finalScore - left.scoreBreakdown.finalScore);
}
