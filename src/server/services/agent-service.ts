import { ApprovalStatus, DecisionStatus, Prisma, RunStatus, TransactionStatus } from "@prisma/client";
import { runAdkReview } from "@/lib/adk/runner";
import { pollRouteStatus } from "@/lib/lifi/execution";
import { buildDecision } from "@/lib/orchestration/rebalance";
import { executeSignedTransaction } from "@/lib/wallet/signing-service";
import type { AgentCycleResult, ExecutionPlan, TransactionExecutionResult } from "@/types/domain";
import { prisma } from "@/lib/db/prisma";
import { createApprovalRequest, updateApprovalStatus } from "@/server/services/approval-service";
import { createExecutionLog, ensureUserStrategy, persistOpportunitySnapshots, persistPositions, toStrategyPolicy } from "@/server/services/strategy-service";

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

async function executeExecutionPlan(executionPlan: ExecutionPlan) {
  const results: Array<TransactionExecutionResult & { stepKey: string }> = [];

  for (const step of executionPlan.txSteps) {
    const result = await executeSignedTransaction(step);
    results.push({
      ...result,
      stepKey: step.stepKey,
    });

    if (result.status !== TransactionStatus.CONFIRMED) {
      break;
    }

    if (step.transactionType === "bridge" && result.hash) {
      await pollRouteStatus({
        txHash: result.hash,
        bridge: executionPlan.routeTool,
        fromChain: executionPlan.sourceChainId,
        toChain: executionPlan.destinationChainId,
      });
    }
  }

  return results;
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
    const latestRun = await prisma.agentRun.findFirst({
      where: {
        strategyId: base.strategy.id,
        id: { not: agentRun.id },
      },
      orderBy: {
        startedAt: "desc",
      },
    });
    const recentDecisions = await prisma.rebalanceDecision.findMany({
      where: {
        strategyId: base.strategy.id,
      },
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    const built = await buildDecision({
      walletAddress: base.user.walletAddress as `0x${string}`,
      policy,
      lastRun: latestRun,
      recentDecisionTimestamps: recentDecisions,
    });

    await Promise.all([
      persistPositions(base.strategy.id, built.positions),
      persistOpportunitySnapshots(base.strategy.id, built.opportunities),
    ]);

    const adkReview = await runAdkReview({
      walletAddress: base.user.walletAddress,
      candidate: built.candidate,
      policyResult: built.policyResult,
      executionPlan: built.executionPlan,
      positions: built.positions,
      opportunities: built.opportunities,
    });

    const decision = await prisma.rebalanceDecision.create({
      data: {
        strategyId: base.strategy.id,
        agentRunId: agentRun.id,
        status: built.policyResult?.status ?? DecisionStatus.NO_ACTION,
        summary: adkReview.strategyOutput.summary,
        reason: adkReview.strategyOutput.reason,
        sourceChainId: built.candidate?.sourcePosition.chainId,
        destinationChainId: built.candidate?.destinationOpportunity.chainId,
        sourceProtocol: built.candidate?.sourcePosition.protocol,
        destinationProtocol: built.candidate?.destinationOpportunity.protocol,
        sourceAsset: built.candidate?.sourcePosition.assetSymbol,
        destinationAsset: built.candidate?.destinationOpportunity.assetSymbol,
        amount: built.candidate?.amount.toString(),
        amountUsd: built.candidate?.amountUsd,
        estimatedApyDelta: built.candidate?.expectedApyDelta,
        estimatedNetBenefitUsd: built.candidate?.expectedNetBenefitUsd,
        bridgeCostUsd: built.candidate?.routeCost.bridgeCostUsd,
        gasCostUsd: built.executionPlan?.gasCostUsd,
        slippageBps: built.executionPlan?.slippageBps,
        scoreBreakdown: (built.candidate?.scoreBreakdown ?? {}) as Prisma.JsonObject,
        actionPlan: (built.executionPlan ?? {}) as Prisma.JsonObject,
      },
    });

    if (built.executionPlan) {
      await persistDecisionTransactionPlan(decision.id, built.executionPlan);
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
      },
    });

    let approvalRequestId: string | undefined;
    let transactionHashes: string[] | undefined;
    let decisionStatus = decision.status;
    let summary = adkReview.portfolioOutput.message;

    if (!built.executionPlan) {
      summary = adkReview.riskOutput.summary;
    } else if (policy.dryRun) {
      decisionStatus = DecisionStatus.NO_ACTION;
      summary = "Dry-run mode is enabled. YieldPilot prepared a plan but did not execute it.";
    } else if (built.policyResult?.requiresHumanApproval) {
      const approval = await createApprovalRequest({
        userId: base.user.id,
        strategyId: base.strategy.id,
        rebalanceDecisionId: decision.id,
        executionPlan: built.executionPlan,
        requestedAction: {
          strategy: adkReview.strategyOutput,
          risk: adkReview.riskOutput,
          execution: adkReview.executionOutput,
        },
      });

      approvalRequestId = approval.id;
      decisionStatus = DecisionStatus.QUEUED_FOR_APPROVAL;
      summary = "A rebalance plan was queued for human approval.";
    } else if (built.policyResult?.allowed) {
      const results = await executeExecutionPlan(built.executionPlan);
      transactionHashes = results.map((result) => result.hash).filter((hash): hash is string => Boolean(hash));
      const failed = results.some((result) => result.status !== TransactionStatus.CONFIRMED);
      decisionStatus = failed ? DecisionStatus.FAILED : DecisionStatus.EXECUTED;

      for (const result of results) {
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
        ? "Autonomous execution failed. Review the transaction log."
        : "Autonomous execution completed successfully.";
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
        },
      },
    });

    return {
      runStatus: RunStatus.COMPLETED,
      summary,
      decisionStatus,
      positions: built.positions,
      opportunities: built.opportunities,
      candidate: built.candidate,
      policyResult: built.policyResult,
      executionPlan: built.executionPlan,
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
