import { RiskProfile, StrategyMode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { calculateExpectedNetBenefit, calculateOpportunityScore, rankCandidates } from "@/lib/scoring/engine";
import type { PortfolioPosition, RouteCostEstimate, StrategyPolicy, YieldOpportunity } from "@/types/domain";

const sourcePosition: PortfolioPosition = {
  id: "position-1",
  walletAddress: "0x1000000000000000000000000000000000000001",
  chainId: 42161,
  chainKey: "arbitrum",
  chainLabel: "Arbitrum",
  protocol: "aave-v3",
  protocolLabel: "Aave V3",
  assetSymbol: "USDC",
  assetAddress: "0x2000000000000000000000000000000000000002",
  balance: "10000000000",
  balanceFormatted: 10_000,
  balanceUsd: 10_000,
  apy: 4,
  positionType: "lending",
  metadata: {},
};

const basePolicy: StrategyPolicy = {
  strategyId: "strategy-1",
  mode: StrategyMode.HUMAN_APPROVAL,
  riskProfile: RiskProfile.BALANCED,
  rebalanceThresholdBps: 50,
  maxRebalanceUsd: 10_000,
  maxDailyMovedUsd: 25_000,
  cooldownMinutes: 120,
  slippageBps: 30,
  dryRun: false,
  emergencyPause: false,
  approvedChains: [42161, 8453, 10],
  approvedProtocols: ["aave-v3"],
  approvedAssets: ["USDC", "USDT", "DAI"],
  protocolPermanentApprovals: [],
  protocolAmountThresholds: { "aave-v3": 1_000 },
  maxTransactionUsd: 10_000,
  minNetBenefitUsd: 5,
  maxSlippageBps: 30,
  dailyMovedLimitUsd: 25_000,
  stopLossBps: null,
  autoApproveTrustedProtocols: false,
  allowUnlimitedApprovals: false,
};

const bestOpportunity: YieldOpportunity = {
  id: "arb-aave-usdc",
  protocol: "aave-v3",
  protocolLabel: "Aave V3",
  chainId: 42161,
  chainKey: "arbitrum",
  chainLabel: "Arbitrum",
  assetSymbol: "USDC",
  assetAddress: "0x2000000000000000000000000000000000000002",
  apy: 7,
  liquidityRate: "0",
  availableLiquidityUsd: 80_000_000,
  totalSupplyUsd: 90_000_000,
  tvlUsd: 50_000_000,
  reserveFactor: 0.1,
  priceUsd: 1,
  riskPenalty: 1,
  metadata: {},
};

const secondaryOpportunity: YieldOpportunity = {
  ...bestOpportunity,
  id: "base-aave-usdc",
  chainId: 8453,
  chainKey: "base",
  chainLabel: "Base",
  apy: 7.2,
  tvlUsd: 2_500_000,
};

const bestRouteCost: RouteCostEstimate = {
  routeId: "route-1",
  routeLabel: "LI.FI route",
  tool: "lifi",
  bridgeCostUsd: 12,
  gasCostUsd: 3,
  totalCostUsd: 15,
  executionDurationSec: 180,
  route: {},
};

describe("scoring engine", () => {
  it("computes a score from APY, risk, slippage, and route costs", () => {
    const score = calculateOpportunityScore({
      opportunity: bestOpportunity,
      routeCost: bestRouteCost,
      amountUsd: 10_000,
      slippageBps: 30,
      riskProfile: RiskProfile.BALANCED,
    });

    expect(score.finalScore).toBeCloseTo(8.55, 2);
    expect(score.bridgeCostPenalty).toBeCloseTo(0.12, 4);
    expect(score.gasPenalty).toBeCloseTo(0.03, 4);
    expect(score.liquidityBonus).toBe(3);
  });

  it("projects net benefit over the holding period after route costs", () => {
    const netBenefit = calculateExpectedNetBenefit({
      currentApy: 4,
      targetApy: 7,
      amountUsd: 10_000,
      routeCostUsd: 15,
    });

    expect(netBenefit).toBeCloseTo(9.6575, 3);
  });

  it("ranks candidates by their score breakdown", () => {
    const candidates = rankCandidates({
      currentApy: sourcePosition.apy,
      amountUsd: sourcePosition.balanceUsd,
      opportunities: [secondaryOpportunity, bestOpportunity],
      routeCostByOpportunity: new Map([
        [bestOpportunity.id, bestRouteCost],
        [
          secondaryOpportunity.id,
          {
            ...bestRouteCost,
            routeId: "route-2",
            totalCostUsd: 40,
            bridgeCostUsd: 30,
            gasCostUsd: 10,
          },
        ],
      ]),
      policy: basePolicy,
      sourcePosition,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.destinationOpportunity.id).toBe(bestOpportunity.id);
    expect(candidates[0]?.expectedNetBenefitUsd).toBeGreaterThan(candidates[1]?.expectedNetBenefitUsd ?? 0);
  });
});
