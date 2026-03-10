import type { AgentActionKind, RiskPolicy } from "@/agent/types";
import type { StrategyPolicy } from "@/types/domain";

function toActionKinds(values: string[]): AgentActionKind[] {
  return values as AgentActionKind[];
}

export function toRiskPolicy(policy: StrategyPolicy): RiskPolicy {
  return {
    strategyId: policy.strategyId,
    strategyKey: (policy.strategyKey as RiskPolicy["strategyKey"] | undefined) ?? "yield-agent",
    approvedChains: policy.approvedChains,
    approvedProtocols: policy.approvedProtocols,
    approvedAssets: policy.approvedAssets,
    approvedContractAddresses: policy.approvedContractAddresses,
    approvedMethodSelectors: policy.approvedMethodSelectors,
    approvedActionKinds: toActionKinds(policy.approvedActionKinds),
    maxTransactionUsd: policy.maxTransactionUsd,
    maxDailyNotionalUsd: policy.dailyMovedLimitUsd ?? policy.maxDailyMovedUsd,
    maxSlippageBps: policy.maxSlippageBps,
    maxApprovalUsd: policy.maxApprovalUsd,
    maxApprovalAmount: policy.maxApprovalAmount,
    maxActionsPerCycle: policy.maxActionsPerCycle,
    maxDailyActions: policy.maxDailyActions,
    maxReasoningSteps: policy.maxReasoningSteps,
    cycleTimeoutMs: policy.cycleTimeoutMs,
    maxLeverage: policy.maxLeverage,
    maxOpenPositions: policy.maxOpenPositions,
    maxNftPurchaseUsd: policy.maxNftPurchaseUsd,
    maxVaultDepositUsd: policy.maxVaultDepositUsd,
    collateralHealthThresholdBps: policy.collateralHealthThresholdBps,
    requireSimulation: policy.requireSimulation,
    liveExecutionEnabled: policy.liveExecutionEnabled,
    enableSmartAccounts: policy.enableSmartAccounts,
    enableGasSponsorship: policy.enableGasSponsorship,
    emergencyPause: policy.emergencyPause,
    circuitBreakerThreshold: policy.circuitBreakerThreshold,
    circuitBreakerWindowMinutes: policy.circuitBreakerWindowMinutes,
  };
}
