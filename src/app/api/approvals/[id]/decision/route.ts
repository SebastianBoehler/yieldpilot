import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { pollRouteStatus } from "@/lib/lifi/execution";
import { approveRequestAndLoadPlan, rejectApproval } from "@/server/services/agent-service";
import { recordApprovalExecutionResults } from "@/server/services/approval-service";
import { ensureUserStrategy, toStrategyPolicy, updateStrategySettings } from "@/server/services/strategy-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json();
  const action = body.action as string | undefined;

  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  if (action === "approve_once") {
    const plan = await approveRequestAndLoadPlan(id);
    return NextResponse.json({ plan });
  }

  if (action === "reject") {
    const approval = await rejectApproval(id);
    return NextResponse.json({ status: approval.status });
  }

  if (action === "record_execution") {
    await recordApprovalExecutionResults({
      approvalId: id,
      results: body.results ?? [],
    });

    return NextResponse.json({ ok: true });
  }

  const approval = await prisma.approvalRequest.findUnique({
    where: { id },
    include: {
      strategy: true,
      user: true,
    },
  });

  if (!approval) {
    return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
  }

  const base = await ensureUserStrategy(approval.user.walletAddress);
  if (!base?.strategy.policyConfig) {
    return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }

  const policy = toStrategyPolicy(base.strategy);
  const plan = approval.transactionPlan as { destinationProtocol?: string; amountUsd?: number; txSteps?: Array<{ protocol?: string }> };
  const protocol = plan.txSteps?.find((step) => step.protocol && step.protocol !== "ERC20" && step.protocol !== "LI.FI")?.protocol?.toLowerCase() ?? "aave-v3";

  if (action === "bridge_status") {
    const executionPlan = approval.transactionPlan as {
      routeTool: string;
      sourceChainId: number;
      destinationChainId: number;
    };
    const status = await pollRouteStatus({
      txHash: body.txHash,
      bridge: executionPlan.routeTool,
      fromChain: executionPlan.sourceChainId,
      toChain: executionPlan.destinationChainId,
    });
    return NextResponse.json(status);
  }

  if (action === "trust_protocol") {
    const permanentApprovals = Array.from(new Set([...policy.protocolPermanentApprovals, protocol]));

    await updateStrategySettings(approval.user.walletAddress, {
      protocolPermanentApprovals: permanentApprovals,
      autoApproveTrustedProtocols: true,
    });

    return NextResponse.json({ ok: true, permanentApprovals });
  }

  if (action === "set_threshold") {
    const nextThresholds = {
      ...policy.protocolAmountThresholds,
      [protocol]: Number(body.maxAmountUsd ?? plan.amountUsd ?? 0),
    };

    await updateStrategySettings(approval.user.walletAddress, {
      protocolAmountThresholds: nextThresholds,
    });

    return NextResponse.json({ ok: true, protocolAmountThresholds: nextThresholds });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
