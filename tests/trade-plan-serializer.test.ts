import { describe, expect, it } from "vitest";
import { buildExecutionPlanFromActionResults } from "@/server/services/trade-plan-serializer";

describe("trade plan serializer", () => {
  it("serializes execution plan details from dry-run action bundles", () => {
    const executionPlan = buildExecutionPlanFromActionResults(
      [
        {
          request: {
            strategyKey: "yield-agent",
            title: "Bridge and swap",
            kind: "bridge_swap",
            protocol: "lifi",
            chainId: 8453,
            accountAddress: "0x1111111111111111111111111111111111111111",
            metadata: {},
          },
          plannedBundle: {
            mode: "eoa",
            routeTool: "lifi",
            sponsorship: {
              eligible: false,
              sponsored: false,
              mode: "none",
              metadata: {},
            },
            metadata: {},
            txSteps: [
              {
                stepKey: "swap",
                title: "Swap",
                transactionType: "swap",
                chainId: 8453,
                to: "0x2222222222222222222222222222222222222222",
                description: "Swap through LI.FI",
                protocol: "LI.FI",
                assetSymbol: "USDC",
                estimatedGasUsd: 2.5,
                metadata: {},
              },
            ],
          },
        },
      ],
      {
        sourcePosition: {
          id: "source",
          walletAddress: "0x1111111111111111111111111111111111111111",
          chainId: 8453,
          chainKey: "base",
          chainLabel: "Base",
          protocol: "wallet",
          protocolLabel: "Wallet",
          assetSymbol: "USDC",
          assetAddress: "0x3333333333333333333333333333333333333333",
          balance: "1000000",
          balanceFormatted: 1000,
          balanceUsd: 1000,
          apy: 0,
          positionType: "idle",
          metadata: {},
        },
        destinationOpportunity: {
          id: "dest",
          protocol: "aave-v3",
          protocolLabel: "Aave V3",
          chainId: 42161,
          chainKey: "arbitrum",
          chainLabel: "Arbitrum",
          assetSymbol: "USDC",
          assetAddress: "0x4444444444444444444444444444444444444444",
          apy: 0.08,
          liquidityRate: "0.08",
          availableLiquidityUsd: 1000000,
          totalSupplyUsd: 1000000,
          tvlUsd: 1000000,
          reserveFactor: 0.1,
          priceUsd: 1,
          riskPenalty: 0,
          metadata: {},
        },
        amount: 1000000n,
        amountUsd: 1000,
        expectedApyDelta: 0.03,
        expectedNetBenefitUsd: 15,
        routeCost: {
          routeId: "route-1",
          routeLabel: "USDC 8453 -> USDC 42161",
          tool: "lifi",
          bridgeCostUsd: 1,
          gasCostUsd: 0.5,
          totalCostUsd: 1.5,
          executionDurationSec: 120,
          route: {},
        },
        scoreBreakdown: {
          rawApy: 0.08,
          riskPenalty: 0,
          bridgeCostPenalty: 0.01,
          gasPenalty: 0.005,
          slippagePenalty: 0.002,
          liquidityBonus: 0.01,
          chainPreference: 0.01,
          finalScore: 0.083,
        },
        rationale: "Best net benefit after fees.",
      },
    );

    expect(executionPlan).toMatchObject({
      routeId: "route-1",
      sourceAsset: "USDC",
      destinationAsset: "USDC",
      routeTool: "lifi",
      gasCostUsd: 3,
    });
  });
});
