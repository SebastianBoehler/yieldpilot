import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { LaunchAnalysis, ResearchSignalInput, ResearchSignalOutput, TradePlanOutput, WhaleAlert } from "@/types/virtuals";

export async function upsertAcpJobAudit(params: {
  agentKey: string;
  acpJobId: string;
  offeringKey?: string;
  phase?: string;
  status: string;
  buyerAddress?: string;
  providerAddress?: string;
  requestPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  error?: string;
}) {
  return prisma.acpJobAudit.upsert({
    where: {
      agentKey_acpJobId: {
        agentKey: params.agentKey,
        acpJobId: params.acpJobId,
      },
    },
    create: {
      agentKey: params.agentKey,
      acpJobId: params.acpJobId,
      offeringKey: params.offeringKey,
      phase: params.phase,
      status: params.status,
      buyerAddress: params.buyerAddress,
      providerAddress: params.providerAddress,
      requestPayload: params.requestPayload as Prisma.InputJsonValue | undefined,
      responsePayload: params.responsePayload as Prisma.InputJsonValue | undefined,
      error: params.error,
    },
    update: {
      offeringKey: params.offeringKey,
      phase: params.phase,
      status: params.status,
      buyerAddress: params.buyerAddress,
      providerAddress: params.providerAddress,
      requestPayload: params.requestPayload as Prisma.InputJsonValue | undefined,
      responsePayload: params.responsePayload as Prisma.InputJsonValue | undefined,
      error: params.error,
    },
  });
}

export async function createResearchSignalRecord(params: {
  input: ResearchSignalInput;
  output: ResearchSignalOutput;
  launchAnalysis?: LaunchAnalysis | null;
  whaleAlerts?: WhaleAlert[];
}) {
  const signal = await prisma.researchSignal.create({
    data: {
      agentKey: "yieldpilot-research",
      offeringKey: params.input.offeringKey,
      query: params.input.query,
      walletAddress: params.input.walletAddress,
      tokenAddress: params.input.tokenAddress,
      chainKey: params.input.chainKey,
      signal: params.output.signal,
      summary: params.output.summary,
      confidence: params.output.confidence,
      timeHorizon: params.output.time_horizon,
      supportingFacts: params.output.supporting_facts,
      risks: params.output.risks,
      input: params.input as unknown as Prisma.InputJsonValue,
      output: params.output as unknown as Prisma.InputJsonValue,
    },
  });

  if (params.launchAnalysis) {
    await prisma.launchAnalysis.create({
      data: {
        query: params.launchAnalysis.query,
        chainKey: params.launchAnalysis.chainKey,
        tokenAddress: params.launchAnalysis.tokenAddress,
        pairAddress: params.launchAnalysis.pairAddress,
        dexId: params.launchAnalysis.dexId,
        label: params.launchAnalysis.label,
        priceUsd: params.launchAnalysis.priceUsd,
        liquidityUsd: params.launchAnalysis.liquidityUsd,
        volume24hUsd: params.launchAnalysis.volume24hUsd,
        priceChange24hPct: params.launchAnalysis.priceChange24hPct,
        pairCreatedAt: params.launchAnalysis.pairCreatedAt ? new Date(params.launchAnalysis.pairCreatedAt) : undefined,
        sourceUrl: params.launchAnalysis.url,
        metadata: params.launchAnalysis.metadata as Prisma.InputJsonValue,
        signalId: signal.id,
      },
    });
  }

  if (params.whaleAlerts?.length) {
    await Promise.all(
      params.whaleAlerts.map((alert) =>
        prisma.whaleAlert.upsert({
          where: {
            txHash_walletAddress_chainKey: {
              txHash: alert.txHash,
              walletAddress: alert.walletAddress,
              chainKey: alert.chainKey,
            },
          },
          create: {
            label: alert.label,
            walletAddress: alert.walletAddress,
            chainKey: alert.chainKey,
            direction: alert.direction,
            tokenSymbol: alert.tokenSymbol,
            tokenAddress: alert.tokenAddress,
            amount: alert.amount,
            amountUsd: alert.amountUsd,
            counterparty: alert.counterparty,
            txHash: alert.txHash,
            observedAt: new Date(alert.observedAt),
            metadata: alert.metadata as Prisma.InputJsonValue,
            signalId: signal.id,
          },
          update: {
            label: alert.label,
            direction: alert.direction,
            tokenSymbol: alert.tokenSymbol,
            tokenAddress: alert.tokenAddress,
            amount: alert.amount,
            amountUsd: alert.amountUsd,
            counterparty: alert.counterparty,
            observedAt: new Date(alert.observedAt),
            metadata: alert.metadata as Prisma.InputJsonValue,
            signalId: signal.id,
          },
        }),
      ),
    );
  }

  return signal;
}

export async function createTradePlanRecord(params: {
  input: Record<string, unknown>;
  output: TradePlanOutput;
}) {
  const executionPlan = params.output.executionPlan;

  return prisma.tradePlanRecord.create({
    data: {
      offeringKey: params.output.planType,
      walletAddress: params.output.walletAddress,
      summary: params.output.summary,
      policyAllowed: params.output.policyAllowed,
      requiresApproval: params.output.requiresApproval,
      sourceChainId: executionPlan?.sourceChainId,
      destinationChainId: executionPlan?.destinationChainId,
      sourceAsset: executionPlan?.sourceAsset,
      destinationAsset: executionPlan?.destinationAsset,
      amount: executionPlan?.amount,
      amountUsd: executionPlan?.amountUsd,
      executionUrl: params.output.executionUrl,
      input: params.input as Prisma.InputJsonValue,
      output: params.output as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getLatestResearchSignals(limit = 5) {
  return prisma.researchSignal.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getSignalHistory(limit = 25) {
  return prisma.researchSignal.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getTrackedWhaleAlerts(limit = 25) {
  return prisma.whaleAlert.findMany({
    orderBy: { observedAt: "desc" },
    take: limit,
  });
}

export async function getRecentLaunchAnalyses(limit = 10) {
  return prisma.launchAnalysis.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
