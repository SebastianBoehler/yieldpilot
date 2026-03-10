import { describe, expect, it } from "vitest";
import { toRiskPolicy } from "@/agent/policy";
import { evaluateAgentActionRisk } from "@/risk/agent-risk-engine";
import { buildDefaultStrategyPolicy } from "@/server/services/strategy-service";

const basePolicy = toRiskPolicy({
  ...buildDefaultStrategyPolicy(),
  strategyId: "strategy-1",
});

const baseRequest = {
  strategyKey: "yield-agent" as const,
  title: "Deposit into Aave",
  kind: "lend_deposit" as const,
  protocol: "aave-v3",
  chainId: 42161,
  accountAddress: "0x1000000000000000000000000000000000000001" as const,
  assetSymbol: "USDC",
  amount: "1000000",
  amountUsd: 1000,
  slippageBps: 30,
  metadata: {
    assetAddress: "0x2000000000000000000000000000000000000002",
  },
};

describe("agent risk engine", () => {
  it("blocks actions when live execution is disabled", () => {
    const result = evaluateAgentActionRisk({
      policy: basePolicy,
      request: baseRequest,
      context: {
        dailyActionCount: 0,
        dailyNotionalUsd: 0,
        openPositionCount: 0,
        liveExecutionEnabled: false,
        circuitBreakerOpen: false,
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Live execution is disabled.");
  });

  it("blocks unknown action kinds and oversized approvals", () => {
    const result = evaluateAgentActionRisk({
      policy: {
        ...basePolicy,
        approvedActionKinds: ["lend_deposit"],
        maxApprovalUsd: 100,
      },
      request: {
        ...baseRequest,
        kind: "approve",
        amountUsd: 500,
      },
      context: {
        dailyActionCount: 0,
        dailyNotionalUsd: 0,
        openPositionCount: 0,
        liveExecutionEnabled: true,
        circuitBreakerOpen: false,
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Action kind is not allowlisted.");
    expect(result.reasons).toContain("Approval exceeds the approval USD cap.");
  });

  it("blocks daily action cap and leverage violations", () => {
    const result = evaluateAgentActionRisk({
      policy: {
        ...basePolicy,
        maxDailyActions: 1,
        maxLeverage: 2,
      },
      request: {
        ...baseRequest,
        kind: "perp_open",
        protocol: "perps",
        leverage: 3,
      },
      context: {
        dailyActionCount: 1,
        dailyNotionalUsd: 0,
        openPositionCount: 0,
        liveExecutionEnabled: true,
        circuitBreakerOpen: false,
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Daily action limit would be exceeded.");
    expect(result.reasons).toContain("Requested leverage exceeds the maximum.");
  });
});
