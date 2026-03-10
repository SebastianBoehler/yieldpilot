import { RiskProfile, StrategyMode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@/lib/risk/policy-engine";
import { buildDefaultStrategyPolicy } from "@/server/services/strategy-service";
import type { RebalanceCandidate, StrategyPolicy } from "@/types/domain";

const basePolicy: StrategyPolicy = {
  ...buildDefaultStrategyPolicy(),
  strategyId: "strategy-1",
  mode: StrategyMode.HUMAN_APPROVAL,
  riskProfile: RiskProfile.BALANCED,
};

const candidate: RebalanceCandidate = {
  sourcePosition: {
    id: "position-1",
    walletAddress: "0x1000000000000000000000000000000000000001",
    chainId: 42161,
    chainKey: "arbitrum",
    chainLabel: "Arbitrum",
    protocol: "aave-v3",
    protocolLabel: "Aave V3",
    assetSymbol: "USDC",
    assetAddress: "0x2000000000000000000000000000000000000002",
    balance: "5000000000",
    balanceFormatted: 5_000,
    balanceUsd: 5_000,
    apy: 4,
    positionType: "lending",
    metadata: {},
  },
  destinationOpportunity: {
    id: "direct-arb-aave-usdc",
    protocol: "aave-v3",
    protocolLabel: "Aave V3",
    chainId: 42161,
    chainKey: "arbitrum",
    chainLabel: "Arbitrum",
    assetSymbol: "USDC",
    assetAddress: "0x2000000000000000000000000000000000000002",
    apy: 6,
    liquidityRate: "0",
    availableLiquidityUsd: 10_000_000,
    totalSupplyUsd: 12_500_000,
    tvlUsd: 15_000_000,
    reserveFactor: 0.1,
    priceUsd: 1,
    riskPenalty: 1,
    metadata: {},
  },
  amount: 5_000_000_000n,
  amountUsd: 5_000,
  expectedApyDelta: 2,
  expectedNetBenefitUsd: 12,
  routeCost: {
    routeId: "direct-route",
    routeLabel: "Direct local deployment",
    tool: "direct",
    bridgeCostUsd: 0,
    gasCostUsd: 0,
    totalCostUsd: 0,
    executionDurationSec: 60,
    route: {},
  },
  scoreBreakdown: {
    rawApy: 6,
    riskPenalty: 1.8,
    bridgeCostPenalty: 0,
    gasPenalty: 0,
    slippagePenalty: 0.3,
    liquidityBonus: 3,
    chainPreference: 0.8,
    finalScore: 7.7,
  },
  rationale: "Deploy locally into a higher-yielding Aave position.",
};

describe("policy engine", () => {
  it("allows zero-cost direct routes and queues them for human approval", () => {
    const result = evaluatePolicy({
      policy: basePolicy,
      candidate,
    });

    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.status).toBe("QUEUED_FOR_APPROVAL");
    expect(result.reasons).toHaveLength(0);
  });

  it("blocks candidates that violate policy or cooldown constraints", () => {
    const result = evaluatePolicy({
      policy: {
        ...basePolicy,
        approvedChains: [10],
        minNetBenefitUsd: 20,
      },
      candidate,
      recentDecisions: [{ createdAt: new Date() }] as never,
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Destination chain is not whitelisted.");
    expect(result.reasons).toContain("Projected net benefit is below the configured minimum.");
    expect(result.reasons).toContain("Strategy is inside cooldown window.");
    expect(result.status).toBe("BLOCKED");
  });

  it("only skips human approval for trusted protocols when the toggle is enabled", () => {
    const withoutAutoApproval = evaluatePolicy({
      policy: {
        ...basePolicy,
        protocolPermanentApprovals: ["aave-v3"],
        protocolAmountThresholds: { "aave-v3": 10_000 },
      },
      candidate,
    });

    const withAutoApproval = evaluatePolicy({
      policy: {
        ...basePolicy,
        autoApproveTrustedProtocols: true,
        protocolPermanentApprovals: ["aave-v3"],
        protocolAmountThresholds: { "aave-v3": 10_000 },
      },
      candidate,
    });

    expect(withoutAutoApproval.requiresHumanApproval).toBe(true);
    expect(withAutoApproval.allowed).toBe(true);
    expect(withAutoApproval.requiresHumanApproval).toBe(false);
    expect(withAutoApproval.status).toBe("EXECUTING");
  });
});
