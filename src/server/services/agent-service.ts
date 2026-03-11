import { ApprovalStatus, DecisionStatus, Prisma, RunStatus, TransactionStatus } from "@prisma/client";
import { runAutonomousAgentCycle } from "@/agent/cycle-runner";
import { runAdkReview } from "@/lib/adk/runner";
import { runTradingBrief } from "@/lib/adk/trading-brief";
import type { AgentCycleResult, ExecutionPlan, MarketIntelligenceBrief, PolicyResult } from "@/types/domain";
import { prisma } from "@/lib/db/prisma";
import { getArenaExternalFeeds } from "@/server/services/arena-service";
import { createApprovalRequest, updateApprovalStatus } from "@/server/services/approval-service";
import { getDisplayIndexes } from "@/server/services/index-service";
import { createExecutionLog, ensureUserStrategy, persistOpportunitySnapshots, persistPositions, toStrategyPolicy } from "@/server/services/strategy-service";
import { buildExecutionPlanFromActionResults } from "@/server/services/trade-plan-serializer";
import type { AgentCycleActionResult } from "@/agent/types";

async function persistDecisionTransactionPlan(rebalanceDecisionId: string, executionPlan: ExecutionPlan) {
  await prisma.transactionRecord.createMany({
    data: executionPlan.txSteps.map((step) => ({
      rebalanceDecisionId,
      stepKey: step.stepKey,
      transactionType: step.transactionType,
      chainId: step.chainId,
      toAddress: step.to,
      data: step.data,
      value: step.value,
      spenderAddress: step.spenderAddress,
      status: TransactionStatus.PENDING,
      metadata: step.metadata as Prisma.JsonObject,
    })),
  });
}

function buildPolicyResult(params: {
  policyMode: "HUMAN_APPROVAL" | "AUTONOMOUS";
  executionPlan?: ExecutionPlan;
  actions: AgentCycleActionResult[];
}): PolicyResult {
  const reasons = params.actions.flatMap((action) => action.blockedReasons ?? []);

  return {
    allowed: Boolean(params.executionPlan) && reasons.length === 0,
    requiresHumanApproval: params.policyMode === "HUMAN_APPROVAL" && Boolean(params.executionPlan),
    status:
      !params.executionPlan
        ? DecisionStatus.NO_ACTION
        : reasons.length > 0
          ? DecisionStatus.BLOCKED
          : params.policyMode === "HUMAN_APPROVAL"
            ? DecisionStatus.QUEUED_FOR_APPROVAL
            : DecisionStatus.EXECUTING,
    reasons,
  };
}

async function buildMarketBrief(walletAddress: string): Promise<MarketIntelligenceBrief> {
  const [indexes, externalFeeds] = await Promise.all([
    getDisplayIndexes({ walletAddress }),
    getArenaExternalFeeds(),
  ]);

  return runTradingBrief({
    walletAddress,
    indexes: indexes.map((index) => ({
      key: index.key,
      name: index.name,
      projectedApy: index.projectedApy,
      description: index.description,
    })),
    marketPulse: externalFeeds.marketPulse.map((asset) => ({
      symbol: asset.symbol,
      change24h: asset.change24h,
      priceUsd: asset.priceUsd,
    })),
    newsFeed: externalFeeds.newsFeed.map((item) => ({
      source: item.source,
      title: item.title,
      summary: item.summary,
    })),
  });
}

export async function runAgentCycle(walletAddress?: string): Promise<AgentCycleResult> {
  const base = await ensureUserStrategy(walletAddress);
  if (!base) {
    return {
      runStatus: RunStatus.FAILED,
      summary: "No wallet connected. Connect a wallet or set NEXT_PUBLIC_DEFAULT_WALLET_ADDRESS.",
      decisionStatus: DecisionStatus.FAILED,
      positions: [],
      opportunities: [],
      error: "Wallet not configured.",
    };
  }

  const policy = toStrategyPolicy(base.strategy);

  const agentRun = await prisma.agentRun.create({
    data: {
      userId: base.user.id,
      strategyId: base.strategy.id,
      status: RunStatus.RUNNING,
      agentMode: base.strategy.mode,
      inputs: {
        walletAddress: base.user.walletAddress,
        strategyMode: base.strategy.mode,
      },
    },
  });

  try {
    let marketBrief: MarketIntelligenceBrief | undefined;
    try {
      marketBrief = await buildMarketBrief(base.user.walletAddress);
      await createExecutionLog({
        userId: base.user.id,
        strategyId: base.strategy.id,
        agentRunId: agentRun.id,
        level: "info",
        message: "Prepared 30-minute ADK market brief.",
        context: {
          marketBrief,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await createExecutionLog({
        userId: base.user.id,
        strategyId: base.strategy.id,
        agentRunId: agentRun.id,
        level: "warn",
        message: "Market brief preparation failed; continuing with deterministic execution loop.",
        context: {
          error: message,
        },
      });
    }

    const cycleResult = await runAutonomousAgentCycle({
      walletAddress: base.user.walletAddress as `0x${string}`,
      userId: base.user.id,
      strategyId: base.strategy.id,
      strategyMode: base.strategy.mode,
      policy,
      agentRunId: agentRun.id,
    });
    const executionPlan = buildExecutionPlanFromActionResults(cycleResult.actions, cycleResult.candidate);
    const policyResult = buildPolicyResult({
      policyMode: base.strategy.mode,
      executionPlan,
      actions: cycleResult.actions,
    });

    await Promise.all([
      persistPositions(base.strategy.id, cycleResult.positions),
      persistOpportunitySnapshots(base.strategy.id, cycleResult.opportunities),
    ]);

    const adkReview = await runAdkReview({
      walletAddress: base.user.walletAddress,
      candidate: cycleResult.candidate,
      policyResult,
      executionPlan,
      positions: cycleResult.positions,
      opportunities: cycleResult.opportunities,
    });

    const decision = await prisma.rebalanceDecision.create({
      data: {
        strategyId: base.strategy.id,
        agentRunId: agentRun.id,
        status: policyResult.status ?? DecisionStatus.NO_ACTION,
        summary: adkReview.strategyOutput.summary,
        reason: adkReview.strategyOutput.reason,
        sourceChainId: cycleResult.candidate?.sourcePosition.chainId,
        destinationChainId: cycleResult.candidate?.destinationOpportunity.chainId,
        sourceProtocol: cycleResult.candidate?.sourcePosition.protocol,
        destinationProtocol: cycleResult.candidate?.destinationOpportunity.protocol,
        sourceAsset: cycleResult.candidate?.sourcePosition.assetSymbol,
        destinationAsset: cycleResult.candidate?.destinationOpportunity.assetSymbol,
        amount: cycleResult.candidate?.amount.toString(),
        amountUsd: cycleResult.candidate?.amountUsd,
        estimatedApyDelta: cycleResult.candidate?.expectedApyDelta,
        estimatedNetBenefitUsd: cycleResult.candidate?.expectedNetBenefitUsd,
        bridgeCostUsd: cycleResult.candidate?.routeCost.bridgeCostUsd,
        gasCostUsd: executionPlan?.gasCostUsd,
        slippageBps: executionPlan?.slippageBps,
        scoreBreakdown: (cycleResult.candidate?.scoreBreakdown ?? {}) as Prisma.JsonObject,
        actionPlan: (executionPlan ?? {}) as Prisma.JsonObject,
      },
    });

    if (executionPlan) {
      await persistDecisionTransactionPlan(decision.id, executionPlan);
    }

    await createExecutionLog({
      userId: base.user.id,
      strategyId: base.strategy.id,
      agentRunId: agentRun.id,
      level: "info",
      message: adkReview.portfolioOutput.message,
      context: {
        strategy: adkReview.strategyOutput,
        risk: adkReview.riskOutput,
        execution: adkReview.executionOutput,
        cycle: {
          id: cycleResult.cycleId,
          liveExecutionEnabled: cycleResult.liveExecutionEnabled,
          trace: cycleResult.trace,
        },
      },
    });

    let approvalRequestId: string | undefined;
    let transactionHashes: string[] | undefined;
    let decisionStatus = decision.status;
    let summary = cycleResult.summary;

    if (!executionPlan) {
      summary = adkReview.riskOutput.summary;
    } else if (policy.dryRun || !policy.liveExecutionEnabled) {
      decisionStatus = DecisionStatus.NO_ACTION;
      summary = "Live execution is disabled. YieldPilot prepared a main-agent action plan but did not execute it.";
    } else if (policyResult.requiresHumanApproval) {
      const approval = await createApprovalRequest({
        userId: base.user.id,
        strategyId: base.strategy.id,
        rebalanceDecisionId: decision.id,
        executionPlan,
        requestedAction: {
          strategy: adkReview.strategyOutput,
          risk: adkReview.riskOutput,
          execution: adkReview.executionOutput,
          cycle: cycleResult.trace,
        },
      });

      approvalRequestId = approval.id;
      decisionStatus = DecisionStatus.QUEUED_FOR_APPROVAL;
      summary = "An autonomous onchain action plan was queued for human approval.";
    } else if (policyResult.allowed) {
      const stepResults = cycleResult.actions.flatMap((action) => {
        const stepResultsValue = action.execution?.metadata.stepResults;
        return Array.isArray(stepResultsValue)
          ? (stepResultsValue as Array<{ stepKey: string; hash?: string; status: TransactionStatus }>)
          : [];
      });
      transactionHashes = stepResults
        .map((result) => result.hash)
        .filter((hash): hash is string => Boolean(hash));
      const failed = cycleResult.actions.some((action) => action.execution?.status !== "CONFIRMED");
      decisionStatus = failed ? DecisionStatus.FAILED : DecisionStatus.EXECUTED;

      for (const result of stepResults) {
        await prisma.transactionRecord.updateMany({
          where: {
            rebalanceDecisionId: decision.id,
            stepKey: result.stepKey,
          },
          data: {
            hash: result.hash,
            status: result.status as TransactionStatus,
            submittedAt: result.hash ? new Date() : undefined,
            confirmedAt: result.status === TransactionStatus.CONFIRMED ? new Date() : undefined,
          },
        });
      }

      summary = failed
        ? "Autonomous onchain execution failed. Review the transaction log."
        : "Autonomous onchain execution completed successfully.";
    }

    await prisma.rebalanceDecision.update({
      where: { id: decision.id },
      data: {
        status: decisionStatus,
      },
    });

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: RunStatus.COMPLETED,
        completedAt: new Date(),
        summary,
        outputs: {
          strategy: adkReview.strategyOutput,
          risk: adkReview.riskOutput,
          execution: adkReview.executionOutput,
          portfolio: adkReview.portfolioOutput,
          marketBrief,
          cycle: {
            id: cycleResult.cycleId,
            strategyKey: cycleResult.strategyKey,
            trace: cycleResult.trace,
            liveExecutionEnabled: cycleResult.liveExecutionEnabled,
          },
        } as Prisma.JsonObject,
      },
    });

    return {
      runStatus: RunStatus.COMPLETED,
      summary,
      decisionStatus,
      positions: cycleResult.positions,
      opportunities: cycleResult.opportunities,
      marketBrief,
      candidate: cycleResult.candidate,
      policyResult,
      executionPlan,
      approvalRequestId,
      transactionHashes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: RunStatus.FAILED,
        completedAt: new Date(),
        error: message,
        summary: message,
      },
    });

    await createExecutionLog({
      userId: base.user.id,
      strategyId: base.strategy.id,
      agentRunId: agentRun.id,
      level: "error",
      message,
      context: {},
    });

    return {
      runStatus: RunStatus.FAILED,
      summary: message,
      decisionStatus: DecisionStatus.FAILED,
      positions: [],
      opportunities: [],
      error: message,
    };
  }
}

export async function approveRequestAndLoadPlan(approvalId: string) {
  const approval = await updateApprovalStatus({
    approvalId,
    status: ApprovalStatus.APPROVED,
  });

  return approval.transactionPlan as unknown as ExecutionPlan;
}

export async function rejectApproval(approvalId: string) {
  const approval = await updateApprovalStatus({
    approvalId,
    status: ApprovalStatus.REJECTED,
  });

  await prisma.rebalanceDecision.update({
    where: {
      id: approval.rebalanceDecisionId,
    },
    data: {
      status: DecisionStatus.REJECTED,
    },
  });

  return approval;
}
