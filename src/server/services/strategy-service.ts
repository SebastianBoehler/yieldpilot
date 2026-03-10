import { DecisionStatus, Prisma, RiskProfile, StrategyMode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import type { DashboardSnapshot, ExecutionLogEntry, PortfolioPosition, StrategyPolicy, YieldOpportunity } from "@/types/domain";
import { parseJsonArray, parseJsonNumberArray, parseJsonRecord } from "@/lib/utils/number";
import { scheduleLabel } from "@/lib/utils/time";

export const defaultStrategyConfig = {
  name: "Primary Treasury",
  strategyKey: "yield-agent",
  mode: StrategyMode.HUMAN_APPROVAL,
  riskProfile: RiskProfile.BALANCED,
  rebalanceThresholdBps: 50,
  maxRebalanceUsd: 10_000,
  maxDailyMovedUsd: 25_000,
  cooldownMinutes: 120,
  slippageBps: 30,
  dryRun: false,
  emergencyPause: false,
};

export const defaultPolicyConfig = {
  approvedChains: [42161, 8453, 10],
  approvedProtocols: ["aave-v3"],
  approvedAssets: ["USDC", "USDT", "DAI"],
  approvedContractAddresses: [],
  approvedMethodSelectors: [],
  approvedActionKinds: ["swap", "bridge_swap", "lend_deposit", "lend_withdraw", "borrow", "repay", "yield_deposit", "yield_withdraw", "approve", "permit"],
  protocolPermanentApprovals: [],
  protocolAmountThresholds: { "aave-v3": 1000 },
  maxTransactionUsd: 10_000,
  minNetBenefitUsd: 5,
  maxSlippageBps: 30,
  maxApprovalUsd: 5_000,
  maxApprovalAmount: 5_000,
  maxActionsPerCycle: 4,
  maxDailyActions: 12,
  maxReasoningSteps: 6,
  cycleTimeoutMs: 120_000,
  maxLeverage: 1,
  maxOpenPositions: 3,
  maxNftPurchaseUsd: 250,
  maxVaultDepositUsd: 5_000,
  collateralHealthThresholdBps: 12_000,
  requireSimulation: true,
  liveExecutionEnabled: env.LIVE_EXECUTION_ENABLED,
  enableSmartAccounts: env.ENABLE_SMART_ACCOUNTS,
  enableGasSponsorship: env.ENABLE_GAS_SPONSORSHIP,
  circuitBreakerThreshold: 3,
  circuitBreakerWindowMinutes: 60,
  dailyMovedLimitUsd: 25_000,
  stopLossBps: null,
  autoApproveTrustedProtocols: false,
  allowUnlimitedApprovals: false,
};

export function buildDefaultStrategyPolicy(walletMode: StrategyMode = StrategyMode.HUMAN_APPROVAL): StrategyPolicy {
  return {
    strategyId: "ephemeral-strategy",
    mode: walletMode,
    riskProfile: defaultStrategyConfig.riskProfile,
    strategyKey: defaultStrategyConfig.strategyKey,
    rebalanceThresholdBps: defaultStrategyConfig.rebalanceThresholdBps,
    maxRebalanceUsd: defaultStrategyConfig.maxRebalanceUsd,
    maxDailyMovedUsd: defaultStrategyConfig.maxDailyMovedUsd,
    cooldownMinutes: defaultStrategyConfig.cooldownMinutes,
    slippageBps: defaultStrategyConfig.slippageBps,
    dryRun: defaultStrategyConfig.dryRun,
    emergencyPause: defaultStrategyConfig.emergencyPause,
    approvedChains: [...defaultPolicyConfig.approvedChains],
    approvedProtocols: [...defaultPolicyConfig.approvedProtocols],
    approvedAssets: [...defaultPolicyConfig.approvedAssets],
    approvedContractAddresses: [...defaultPolicyConfig.approvedContractAddresses],
    approvedMethodSelectors: [...defaultPolicyConfig.approvedMethodSelectors],
    approvedActionKinds: [...defaultPolicyConfig.approvedActionKinds],
    protocolPermanentApprovals: [...defaultPolicyConfig.protocolPermanentApprovals],
    protocolAmountThresholds: { ...defaultPolicyConfig.protocolAmountThresholds },
    maxTransactionUsd: defaultPolicyConfig.maxTransactionUsd,
    minNetBenefitUsd: defaultPolicyConfig.minNetBenefitUsd,
    maxSlippageBps: defaultPolicyConfig.maxSlippageBps,
    maxApprovalUsd: defaultPolicyConfig.maxApprovalUsd,
    maxApprovalAmount: defaultPolicyConfig.maxApprovalAmount,
    maxActionsPerCycle: defaultPolicyConfig.maxActionsPerCycle,
    maxDailyActions: defaultPolicyConfig.maxDailyActions,
    maxReasoningSteps: defaultPolicyConfig.maxReasoningSteps,
    cycleTimeoutMs: defaultPolicyConfig.cycleTimeoutMs,
    maxLeverage: defaultPolicyConfig.maxLeverage,
    maxOpenPositions: defaultPolicyConfig.maxOpenPositions,
    maxNftPurchaseUsd: defaultPolicyConfig.maxNftPurchaseUsd,
    maxVaultDepositUsd: defaultPolicyConfig.maxVaultDepositUsd,
    collateralHealthThresholdBps: defaultPolicyConfig.collateralHealthThresholdBps,
    requireSimulation: defaultPolicyConfig.requireSimulation,
    liveExecutionEnabled: defaultPolicyConfig.liveExecutionEnabled,
    enableSmartAccounts: defaultPolicyConfig.enableSmartAccounts,
    enableGasSponsorship: defaultPolicyConfig.enableGasSponsorship,
    circuitBreakerThreshold: defaultPolicyConfig.circuitBreakerThreshold,
    circuitBreakerWindowMinutes: defaultPolicyConfig.circuitBreakerWindowMinutes,
    dailyMovedLimitUsd: defaultPolicyConfig.dailyMovedLimitUsd,
    stopLossBps: defaultPolicyConfig.stopLossBps,
    autoApproveTrustedProtocols: defaultPolicyConfig.autoApproveTrustedProtocols,
    allowUnlimitedApprovals: defaultPolicyConfig.allowUnlimitedApprovals,
  };
}

export async function ensureUserStrategy(walletAddress?: string) {
  const normalizedWallet = (walletAddress ?? env.NEXT_PUBLIC_DEFAULT_WALLET_ADDRESS)?.toLowerCase();
  if (!normalizedWallet) {
    return null;
  }

  const user = await prisma.user.upsert({
    where: { walletAddress: normalizedWallet },
    update: {},
    create: {
      walletAddress: normalizedWallet,
    },
  });

  let strategy = await prisma.strategy.findFirst({
    where: { userId: user.id },
    include: {
      policyConfig: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!strategy) {
    strategy = await prisma.strategy.create({
      data: {
        userId: user.id,
        ...defaultStrategyConfig,
        policyConfig: {
          create: defaultPolicyConfig,
        },
      },
      include: {
        policyConfig: true,
      },
    });
  }

  if (!strategy.policyConfig) {
    strategy = await prisma.strategy.update({
      where: { id: strategy.id },
      data: {
        policyConfig: {
          create: defaultPolicyConfig,
        },
      },
      include: {
        policyConfig: true,
      },
    });
  }

  return {
    user,
    strategy,
  };
}

export function toStrategyPolicy(
  strategy: NonNullable<Awaited<ReturnType<typeof ensureUserStrategy>>>["strategy"],
): StrategyPolicy {
  if (!strategy?.policyConfig) {
    throw new Error("Strategy policy is not initialized.");
  }

  return {
    strategyId: strategy.id,
    mode: strategy.mode,
    riskProfile: strategy.riskProfile,
    strategyKey: strategy.strategyKey,
    rebalanceThresholdBps: strategy.rebalanceThresholdBps,
    maxRebalanceUsd: strategy.maxRebalanceUsd,
    maxDailyMovedUsd: strategy.maxDailyMovedUsd,
    cooldownMinutes: strategy.cooldownMinutes,
    slippageBps: strategy.slippageBps,
    dryRun: strategy.dryRun,
    emergencyPause: strategy.emergencyPause,
    approvedChains: parseJsonNumberArray(strategy.policyConfig.approvedChains),
    approvedProtocols: parseJsonArray(strategy.policyConfig.approvedProtocols),
    approvedAssets: parseJsonArray(strategy.policyConfig.approvedAssets),
    approvedContractAddresses: parseJsonArray(strategy.policyConfig.approvedContractAddresses),
    approvedMethodSelectors: parseJsonArray(strategy.policyConfig.approvedMethodSelectors),
    approvedActionKinds: parseJsonArray(strategy.policyConfig.approvedActionKinds),
    protocolPermanentApprovals: parseJsonArray(strategy.policyConfig.protocolPermanentApprovals),
    protocolAmountThresholds: parseJsonRecord(strategy.policyConfig.protocolAmountThresholds),
    maxTransactionUsd: strategy.policyConfig.maxTransactionUsd,
    minNetBenefitUsd: strategy.policyConfig.minNetBenefitUsd,
    maxSlippageBps: strategy.policyConfig.maxSlippageBps,
    maxApprovalUsd: strategy.policyConfig.maxApprovalUsd,
    maxApprovalAmount: strategy.policyConfig.maxApprovalAmount,
    maxActionsPerCycle: strategy.policyConfig.maxActionsPerCycle,
    maxDailyActions: strategy.policyConfig.maxDailyActions,
    maxReasoningSteps: strategy.policyConfig.maxReasoningSteps,
    cycleTimeoutMs: strategy.policyConfig.cycleTimeoutMs,
    maxLeverage: strategy.policyConfig.maxLeverage,
    maxOpenPositions: strategy.policyConfig.maxOpenPositions,
    maxNftPurchaseUsd: strategy.policyConfig.maxNftPurchaseUsd,
    maxVaultDepositUsd: strategy.policyConfig.maxVaultDepositUsd,
    collateralHealthThresholdBps: strategy.policyConfig.collateralHealthThresholdBps,
    requireSimulation: strategy.policyConfig.requireSimulation,
    liveExecutionEnabled: strategy.policyConfig.liveExecutionEnabled,
    enableSmartAccounts: strategy.policyConfig.enableSmartAccounts,
    enableGasSponsorship: strategy.policyConfig.enableGasSponsorship,
    circuitBreakerThreshold: strategy.policyConfig.circuitBreakerThreshold,
    circuitBreakerWindowMinutes: strategy.policyConfig.circuitBreakerWindowMinutes,
    dailyMovedLimitUsd: strategy.policyConfig.dailyMovedLimitUsd,
    stopLossBps: strategy.policyConfig.stopLossBps,
    autoApproveTrustedProtocols: strategy.policyConfig.autoApproveTrustedProtocols,
    allowUnlimitedApprovals: strategy.policyConfig.allowUnlimitedApprovals,
  };
}

export async function persistPositions(strategyId: string, positions: PortfolioPosition[]) {
  const existingIds = new Set<string>();

  await Promise.all(
    positions.map(async (position) => {
      existingIds.add(`${position.chainId}:${position.protocol}:${position.assetAddress}:${position.positionType}`);

      await prisma.position.upsert({
        where: {
          strategyId_chainId_protocol_assetAddress_positionType: {
            strategyId,
            chainId: position.chainId,
            protocol: position.protocol,
            assetAddress: position.assetAddress,
            positionType: position.positionType,
          },
        },
        update: {
          chainKey: position.chainKey,
          assetSymbol: position.assetSymbol,
          balance: position.balance,
          balanceUsd: position.balanceUsd,
          apy: position.apy,
          sourceAddress: position.walletAddress,
          metadata: position.metadata as Prisma.JsonObject,
        },
        create: {
          strategyId,
          chainId: position.chainId,
          chainKey: position.chainKey,
          protocol: position.protocol,
          assetSymbol: position.assetSymbol,
          assetAddress: position.assetAddress,
          balance: position.balance,
          balanceUsd: position.balanceUsd,
          apy: position.apy,
          positionType: position.positionType,
          sourceAddress: position.walletAddress,
          metadata: position.metadata as Prisma.JsonObject,
        },
      });
    }),
  );
}

export async function persistOpportunitySnapshots(strategyId: string, opportunities: YieldOpportunity[]) {
  await prisma.opportunitySnapshot.deleteMany({
    where: {
      strategyId,
      capturedAt: {
        lt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      },
    },
  });

  if (!opportunities.length) {
    return;
  }

  await prisma.opportunitySnapshot.createMany({
    data: opportunities.map((opportunity) => ({
      strategyId,
      chainId: opportunity.chainId,
      chainKey: opportunity.chainKey,
      protocol: opportunity.protocol,
      poolId: opportunity.id,
      assetSymbol: opportunity.assetSymbol,
      assetAddress: opportunity.assetAddress,
      apy: opportunity.apy,
      score: 0,
      tvlUsd: opportunity.tvlUsd,
      riskPenalty: opportunity.riskPenalty,
      metadata: opportunity.metadata as Prisma.JsonObject,
    })),
  });
}

export async function createExecutionLog(input: {
  userId: string;
  strategyId?: string;
  agentRunId?: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
}) {
  return prisma.executionLog.create({
    data: {
      userId: input.userId,
      strategyId: input.strategyId,
      agentRunId: input.agentRunId,
      level: input.level,
      message: input.message,
      context: (input.context ?? {}) as Prisma.JsonObject,
    },
  });
}

export async function getDashboardSnapshot(walletAddress?: string): Promise<DashboardSnapshot> {
  const base = await ensureUserStrategy(walletAddress);
  if (!base) {
    return {
      totalPortfolioUsd: 0,
      effectiveApy: 0,
      pendingApprovals: 0,
      autonomousModeEnabled: false,
      walletType: "evm",
      positions: [],
      opportunityCount: 0,
      currentAllocation: [],
      byChain: [],
      loopStatus: {
        scheduleLabel: scheduleLabel(env.AGENT_LOOP_INTERVAL_MINUTES),
      },
    };
  }

  const [positions, approvals, lastDecision, lastRun] = await Promise.all([
    prisma.position.findMany({
      where: { strategyId: base.strategy.id },
      orderBy: { balanceUsd: "desc" },
    }),
    prisma.approvalRequest.count({
      where: {
        strategyId: base.strategy.id,
        status: "PENDING",
      },
    }),
    prisma.rebalanceDecision.findFirst({
      where: { strategyId: base.strategy.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentRun.findFirst({
      where: { strategyId: base.strategy.id },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const totalPortfolioUsd = positions.reduce((sum, position) => sum + position.balanceUsd, 0);
  const effectiveApy =
    totalPortfolioUsd === 0
      ? 0
      : positions.reduce((sum, position) => sum + position.balanceUsd * position.apy, 0) / totalPortfolioUsd;

  const currentAllocation = positions.map((position) => ({
    label: `${position.assetSymbol} · ${position.protocol}`,
    value: position.balanceUsd,
  }));

  const chainAgg = new Map<string, number>();
  positions.forEach((position) => {
    chainAgg.set(position.chainKey, (chainAgg.get(position.chainKey) ?? 0) + position.balanceUsd);
  });

  const bestOpportunitySnapshot = await prisma.opportunitySnapshot.findFirst({
    where: { strategyId: base.strategy.id },
    orderBy: { apy: "desc" },
  });

  return {
    walletAddress: base.user.walletAddress,
    walletType: "evm",
    totalPortfolioUsd,
    effectiveApy,
    pendingApprovals: approvals,
    autonomousModeEnabled: base.strategy.mode === "AUTONOMOUS",
    positions: positions.map((position) => ({
      id: position.id,
      walletAddress: position.sourceAddress as `0x${string}`,
      chainId: position.chainId,
      chainKey: position.chainKey as "arbitrum" | "base" | "optimism",
      chainLabel: position.chainKey,
      protocol: position.protocol as "wallet" | "aave-v3",
      protocolLabel: position.protocol === "wallet" ? "Wallet" : "Aave V3",
      assetSymbol: position.assetSymbol,
      assetAddress: position.assetAddress as `0x${string}`,
      balance: position.balance,
      balanceFormatted: 0,
      balanceUsd: position.balanceUsd,
      apy: position.apy,
      positionType: position.positionType as "idle" | "lending",
      metadata: (position.metadata ?? {}) as Record<string, unknown>,
    })),
    opportunityCount: bestOpportunitySnapshot ? 1 : 0,
    currentAllocation,
    byChain: Array.from(chainAgg.entries()).map(([label, value]) => ({ label, value })),
    lastDecision: lastDecision
      ? {
          status: lastDecision.status,
          summary: lastDecision.summary,
          createdAt: lastDecision.createdAt.toISOString(),
        }
      : undefined,
    lastRebalance:
      lastDecision && lastDecision.status === DecisionStatus.EXECUTED
        ? {
            summary: lastDecision.summary,
            createdAt: lastDecision.createdAt.toISOString(),
          }
        : undefined,
    loopStatus: {
      lastRunAt: lastRun?.completedAt?.toISOString(),
      status: lastRun?.status,
      scheduleLabel: scheduleLabel(env.AGENT_LOOP_INTERVAL_MINUTES),
    },
    bestOpportunity: bestOpportunitySnapshot
      ? {
          id: bestOpportunitySnapshot.poolId,
          protocol: bestOpportunitySnapshot.protocol as "aave-v3",
          protocolLabel: "Aave V3",
          chainId: bestOpportunitySnapshot.chainId,
          chainKey: bestOpportunitySnapshot.chainKey as "arbitrum" | "base" | "optimism",
          chainLabel: bestOpportunitySnapshot.chainKey,
          assetSymbol: bestOpportunitySnapshot.assetSymbol,
          assetAddress: bestOpportunitySnapshot.assetAddress as `0x${string}`,
          apy: bestOpportunitySnapshot.apy,
          liquidityRate: "0",
          availableLiquidityUsd: bestOpportunitySnapshot.tvlUsd,
          totalSupplyUsd: bestOpportunitySnapshot.tvlUsd,
          tvlUsd: bestOpportunitySnapshot.tvlUsd,
          reserveFactor: bestOpportunitySnapshot.riskPenalty,
          priceUsd: 1,
          riskPenalty: bestOpportunitySnapshot.riskPenalty,
          metadata: (bestOpportunitySnapshot.metadata ?? {}) as Record<string, unknown>,
        }
      : undefined,
  };
}

export async function updateStrategySettings(walletAddress: string, input: Partial<{
  mode: StrategyMode;
  riskProfile: RiskProfile;
  strategyKey: string;
  rebalanceThresholdBps: number;
  maxRebalanceUsd: number;
  maxDailyMovedUsd: number;
  cooldownMinutes: number;
  slippageBps: number;
  emergencyPause: boolean;
  dryRun: boolean;
  approvedChains: number[];
  approvedProtocols: string[];
  approvedAssets: string[];
  approvedContractAddresses: string[];
  approvedMethodSelectors: string[];
  approvedActionKinds: string[];
  protocolPermanentApprovals: string[];
  protocolAmountThresholds: Record<string, number>;
  maxTransactionUsd: number;
  minNetBenefitUsd: number;
  maxApprovalUsd: number;
  maxApprovalAmount: number;
  maxActionsPerCycle: number;
  maxDailyActions: number;
  maxReasoningSteps: number;
  cycleTimeoutMs: number;
  maxLeverage: number;
  maxOpenPositions: number;
  maxNftPurchaseUsd: number;
  maxVaultDepositUsd: number;
  collateralHealthThresholdBps: number;
  requireSimulation: boolean;
  liveExecutionEnabled: boolean;
  enableSmartAccounts: boolean;
  enableGasSponsorship: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerWindowMinutes: number;
  autoApproveTrustedProtocols: boolean;
}>) {
  const base = await ensureUserStrategy(walletAddress);
  if (!base?.strategy.policyConfig) {
    throw new Error("Strategy not initialized.");
  }

  await prisma.strategy.update({
    where: { id: base.strategy.id },
    data: {
      strategyKey: input.strategyKey,
      mode: input.mode,
      riskProfile: input.riskProfile,
      rebalanceThresholdBps: input.rebalanceThresholdBps,
      maxRebalanceUsd: input.maxRebalanceUsd,
      maxDailyMovedUsd: input.maxDailyMovedUsd,
      cooldownMinutes: input.cooldownMinutes,
      slippageBps: input.slippageBps,
      emergencyPause: input.emergencyPause,
      dryRun: input.dryRun,
      policyConfig: {
        update: {
          approvedChains: input.approvedChains,
          approvedProtocols: input.approvedProtocols,
          approvedAssets: input.approvedAssets,
          approvedContractAddresses: input.approvedContractAddresses,
          approvedMethodSelectors: input.approvedMethodSelectors,
          approvedActionKinds: input.approvedActionKinds,
          protocolPermanentApprovals: input.protocolPermanentApprovals,
          protocolAmountThresholds: input.protocolAmountThresholds,
          maxTransactionUsd: input.maxTransactionUsd,
          minNetBenefitUsd: input.minNetBenefitUsd,
          maxApprovalUsd: input.maxApprovalUsd,
          maxApprovalAmount: input.maxApprovalAmount,
          maxActionsPerCycle: input.maxActionsPerCycle,
          maxDailyActions: input.maxDailyActions,
          maxReasoningSteps: input.maxReasoningSteps,
          cycleTimeoutMs: input.cycleTimeoutMs,
          maxLeverage: input.maxLeverage,
          maxOpenPositions: input.maxOpenPositions,
          maxNftPurchaseUsd: input.maxNftPurchaseUsd,
          maxVaultDepositUsd: input.maxVaultDepositUsd,
          collateralHealthThresholdBps: input.collateralHealthThresholdBps,
          requireSimulation: input.requireSimulation,
          liveExecutionEnabled: input.liveExecutionEnabled,
          enableSmartAccounts: input.enableSmartAccounts,
          enableGasSponsorship: input.enableGasSponsorship,
          circuitBreakerThreshold: input.circuitBreakerThreshold,
          circuitBreakerWindowMinutes: input.circuitBreakerWindowMinutes,
          autoApproveTrustedProtocols: input.autoApproveTrustedProtocols,
        },
      },
    },
  });

  return ensureUserStrategy(walletAddress);
}

export async function getExecutionLogs(walletAddress?: string): Promise<ExecutionLogEntry[]> {
  const base = await ensureUserStrategy(walletAddress);
  if (!base) {
    return [];
  }

  const logs = await prisma.executionLog.findMany({
    where: {
      userId: base.user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  return logs.map((log) => ({
    id: log.id,
    level: log.level,
    message: log.message,
    createdAt: log.createdAt.toISOString(),
    context: (log.context ?? {}) as Record<string, unknown>,
  }));
}
