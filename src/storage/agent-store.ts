import { ActionStatus, Prisma, RunStatus, SponsorshipStatus } from "@prisma/client";
import { startOfDay, subMinutes } from "date-fns";
import type { AgentActionRequest, AgentCycleInput, ProtocolAdapterCapabilities } from "@/agent/types";
import { prisma } from "@/lib/db/prisma";

export async function createAgentCycleRecord(params: AgentCycleInput & { agentRunId?: string }) {
  return prisma.agentCycle.create({
    data: {
      userId: params.userId,
      strategyId: params.strategyId,
      agentRunId: params.agentRunId,
      strategyKey: params.strategyKey,
      liveExecutionEnabled: params.liveExecutionEnabled,
      maxReasoningSteps: params.maxReasoningSteps,
      maxActionsPerCycle: params.maxActionsPerCycle,
      inputs: {
        walletAddress: params.walletAddress,
        strategyKey: params.strategyKey,
        liveExecutionEnabled: params.liveExecutionEnabled,
        maxReasoningSteps: params.maxReasoningSteps,
        maxActionsPerCycle: params.maxActionsPerCycle,
        timeoutMs: params.timeoutMs,
      },
    },
  });
}

export async function finalizeAgentCycleRecord(params: {
  cycleId: string;
  status: RunStatus;
  summary: string;
  outputs?: Record<string, unknown>;
  error?: string;
}) {
  return prisma.agentCycle.update({
    where: { id: params.cycleId },
    data: {
      status: params.status,
      summary: params.summary,
      outputs: (params.outputs ?? {}) as Prisma.JsonObject,
      error: params.error,
      completedAt: new Date(),
    },
  });
}

export async function appendDecisionTrace(params: {
  cycleId: string;
  step: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  return prisma.decisionTrace.create({
    data: {
      agentCycleId: params.cycleId,
      step: params.step,
      message: params.message,
      payload: (params.payload ?? {}) as Prisma.JsonObject,
    },
  });
}

export async function createActionRequestRecord(params: {
  userId: string;
  strategyId: string;
  cycleId: string;
  request: AgentActionRequest;
}) {
  return prisma.actionRequest.create({
    data: {
      userId: params.userId,
      strategyId: params.strategyId,
      agentCycleId: params.cycleId,
      kind: params.request.kind,
      protocol: params.request.protocol,
      chainId: params.request.chainId,
      title: params.request.title,
      amountUsd: params.request.amountUsd,
      assetSymbol: params.request.assetSymbol,
      request: params.request as unknown as Prisma.JsonObject,
    },
  });
}

export async function updateActionRequestRecord(params: {
  actionRequestId: string;
  status?: ActionStatus;
  sponsorshipStatus?: SponsorshipStatus;
  quote?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  simulation?: Record<string, unknown>;
  result?: Record<string, unknown>;
}) {
  return prisma.actionRequest.update({
    where: { id: params.actionRequestId },
    data: {
      status: params.status,
      sponsorshipStatus: params.sponsorshipStatus,
      quote: params.quote as Prisma.JsonObject | undefined,
      validation: params.validation as Prisma.JsonObject | undefined,
      simulation: params.simulation as Prisma.JsonObject | undefined,
      result: params.result as Prisma.JsonObject | undefined,
    },
  });
}

export async function createActionExecutionRecord(params: {
  actionRequestId: string;
  status: ActionStatus;
  walletProvider: string;
  gasSponsored: boolean;
  sponsorshipStatus: SponsorshipStatus;
  transactionHash?: string;
  explorerUrl?: string;
  sponsorMetadata?: Record<string, unknown>;
  executionPayload?: Record<string, unknown>;
  result?: Record<string, unknown>;
}) {
  return prisma.actionExecution.create({
    data: {
      actionRequestId: params.actionRequestId,
      status: params.status,
      walletProvider: params.walletProvider,
      gasSponsored: params.gasSponsored,
      sponsorshipStatus: params.sponsorshipStatus,
      transactionHash: params.transactionHash,
      explorerUrl: params.explorerUrl,
      sponsorMetadata: (params.sponsorMetadata ?? {}) as Prisma.JsonObject,
      executionPayload: (params.executionPayload ?? {}) as Prisma.JsonObject,
      result: (params.result ?? {}) as Prisma.JsonObject,
    },
  });
}

export async function createProtocolLog(params: {
  strategyId: string;
  protocol: string;
  event: string;
  level: string;
  payload?: Record<string, unknown>;
  cycleId?: string;
  actionRequestId?: string;
}) {
  return prisma.protocolLog.create({
    data: {
      strategyId: params.strategyId,
      agentCycleId: params.cycleId,
      actionRequestId: params.actionRequestId,
      protocol: params.protocol,
      event: params.event,
      level: params.level,
      payload: (params.payload ?? {}) as Prisma.JsonObject,
    },
  });
}

export async function snapshotAdapterCapabilities(params: {
  strategyId: string;
  chainId: number;
  actionKind: string;
  walletProvider: string;
  capabilities: ProtocolAdapterCapabilities;
}) {
  return prisma.executionCapabilitySnapshot.create({
    data: {
      strategyId: params.strategyId,
      chainId: params.chainId,
      protocol: params.capabilities.protocol,
      actionKind: params.actionKind,
      walletProvider: params.walletProvider,
      gasSponsorshipSupported: params.capabilities.gasSponsorship,
      smartAccountSupported: params.capabilities.smartAccounts,
      eip7702Supported: params.capabilities.eip7702,
      details: params.capabilities as unknown as Prisma.JsonObject,
    },
  });
}

export async function getDailyActionStats(strategyId: string) {
  const since = startOfDay(new Date());
  const [actions, aggregate] = await Promise.all([
    prisma.actionRequest.count({
      where: {
        strategyId,
        createdAt: { gte: since },
      },
    }),
    prisma.actionRequest.aggregate({
      where: {
        strategyId,
        createdAt: { gte: since },
      },
      _sum: {
        amountUsd: true,
      },
    }),
  ]);

  return {
    count: actions,
    notionalUsd: aggregate._sum.amountUsd ?? 0,
  };
}

export async function getOpenPositionCount(strategyId: string) {
  return prisma.position.count({
    where: {
      strategyId,
      positionType: {
        not: "idle",
      },
      balanceUsd: {
        gt: 0,
      },
    },
  });
}

export async function getCircuitBreakerState(strategyId: string) {
  const state = await prisma.circuitBreakerState.upsert({
    where: { strategyId },
    create: {
      strategyId,
      metadata: {},
    },
    update: {},
  });

  return state;
}

export async function updateCircuitBreaker(params: {
  strategyId: string;
  threshold: number;
  windowMinutes: number;
  success: boolean;
  reason?: string;
}) {
  const current = await getCircuitBreakerState(params.strategyId);
  const windowStart = subMinutes(new Date(), params.windowMinutes);
  const resetWindow = current.windowStartedAt < windowStart;

  const failureCount = resetWindow ? (params.success ? 0 : 1) : params.success ? 0 : current.failureCount + 1;
  const successCount = params.success ? (resetWindow ? 1 : current.successCount + 1) : current.successCount;
  const isOpen = !params.success && failureCount >= params.threshold;

  return prisma.circuitBreakerState.update({
    where: { strategyId: params.strategyId },
    data: {
      failureCount,
      successCount,
      isOpen,
      windowStartedAt: resetWindow ? new Date() : current.windowStartedAt,
      openedAt: isOpen ? new Date() : null,
      reason: isOpen ? params.reason : null,
      metadata: {
        lastReason: params.reason,
      },
    },
  });
}

export async function acquireWorkerLease(params: {
  key: string;
  ownerId: string;
  ttlSeconds: number;
  strategyId?: string;
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + params.ttlSeconds * 1000);
  const existing = await prisma.workerLease.findUnique({
    where: { key: params.key },
  });

  if (existing && existing.expiresAt > now && existing.ownerId !== params.ownerId) {
    return false;
  }

  await prisma.workerLease.upsert({
    where: { key: params.key },
    create: {
      key: params.key,
      ownerId: params.ownerId,
      strategyId: params.strategyId,
      expiresAt,
      metadata: {},
    },
    update: {
      ownerId: params.ownerId,
      strategyId: params.strategyId,
      expiresAt,
    },
  });

  return true;
}

export async function releaseWorkerLease(key: string, ownerId: string) {
  await prisma.workerLease.deleteMany({
    where: {
      key,
      ownerId,
    },
  });
}
