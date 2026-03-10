import { ApprovalStatus, Prisma, TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ApprovalQueueItem, ExecutionPlan, TransactionExecutionResult } from "@/types/domain";

export async function createApprovalRequest(input: {
  userId: string;
  strategyId: string;
  rebalanceDecisionId: string;
  executionPlan: ExecutionPlan;
  requestedAction: Record<string, unknown>;
}) {
  const approval = await prisma.approvalRequest.create({
    data: {
      userId: input.userId,
      strategyId: input.strategyId,
      rebalanceDecisionId: input.rebalanceDecisionId,
      status: ApprovalStatus.PENDING,
      approvalKind: "rebalance",
      requestedAction: input.requestedAction as Prisma.JsonObject,
      transactionPlan: input.executionPlan as unknown as Prisma.JsonObject,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      transactionRecords: {
        create: input.executionPlan.txSteps.map((step) => ({
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
      },
    },
  });

  return approval;
}

export async function getApprovalQueue(walletAddress?: string): Promise<ApprovalQueueItem[]> {
  if (!walletAddress) {
    return [];
  }

  const user = await prisma.user.findUnique({
    where: {
      walletAddress: walletAddress.toLowerCase(),
    },
  });

  if (!user) {
    return [];
  }

  const approvals = await prisma.approvalRequest.findMany({
    where: {
      userId: user.id,
      status: ApprovalStatus.PENDING,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return approvals.map((approval) => ({
    id: approval.id,
    status: approval.status,
    createdAt: approval.createdAt.toISOString(),
    expiresAt: approval.expiresAt?.toISOString(),
    executionPlan: approval.transactionPlan as unknown as ExecutionPlan,
    requestedAction: approval.requestedAction as Record<string, unknown>,
  }));
}

export async function updateApprovalStatus(params: {
  approvalId: string;
  status: ApprovalStatus;
}) {
  return prisma.approvalRequest.update({
    where: { id: params.approvalId },
    data: {
      status: params.status,
      approvedAt: params.status === ApprovalStatus.APPROVED ? new Date() : undefined,
      rejectedAt: params.status === ApprovalStatus.REJECTED ? new Date() : undefined,
      executedAt: params.status === ApprovalStatus.EXECUTED ? new Date() : undefined,
    },
    include: {
      transactionRecords: true,
      rebalanceDecision: true,
    },
  });
}

export async function recordApprovalExecutionResults(input: {
  approvalId: string;
  results: Array<TransactionExecutionResult & { stepKey: string }>;
}) {
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: input.approvalId },
    include: { transactionRecords: true, rebalanceDecision: true },
  });

  if (!approval) {
    throw new Error("Approval request not found.");
  }

  for (const result of input.results) {
    const record = approval.transactionRecords.find((transaction) => transaction.stepKey === result.stepKey);
    if (!record) {
      continue;
    }

    await prisma.transactionRecord.update({
      where: { id: record.id },
      data: {
        hash: result.hash,
        status: result.status,
        submittedAt: result.hash ? new Date() : undefined,
        confirmedAt: result.status === TransactionStatus.CONFIRMED ? new Date() : undefined,
        metadata: {
          ...(record.metadata as Record<string, unknown>),
          explorerUrl: result.explorerUrl,
          error: result.error,
        },
      },
    });
  }

  const failed = input.results.some((result) => result.status === TransactionStatus.FAILED);

  await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: {
      status: failed ? ApprovalStatus.FAILED : ApprovalStatus.EXECUTED,
      executedAt: failed ? undefined : new Date(),
    },
  });

  await prisma.rebalanceDecision.update({
    where: { id: approval.rebalanceDecisionId },
    data: {
      status: failed ? "FAILED" : "EXECUTED",
    },
  });
}
