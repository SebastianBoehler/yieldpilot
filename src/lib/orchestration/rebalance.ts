import type { Route } from "@lifi/types";
import { AAVE_PROTOCOL_LABEL } from "@/lib/config/constants";
import { getBestRouteQuote, buildLifiBridgeStep } from "@/lib/lifi/quotes";
import { buildAaveDepositStep, buildAaveWithdrawStep, estimateGasUsdForStep, getAaveStableOpportunities, getAaveStablePositions } from "@/lib/protocols/aave-v3";
import { evaluatePolicy } from "@/lib/risk/policy-engine";
import { rankCandidates } from "@/lib/scoring/engine";
import { checkTokenAllowance, prepareApprovalTransaction } from "@/lib/wallet/signing-service";
import type { ExecutionPlan, PolicyResult, RebalanceCandidate, StrategyPolicy, TransactionPlanStep } from "@/types/domain";

function createSyntheticRouteCost(sourcePosition: RebalanceCandidate["sourcePosition"]) {
  return {
    routeId: `direct-${sourcePosition.chainId}-${sourcePosition.assetAddress}`,
    routeLabel: "Direct local deployment",
    tool: "direct",
    bridgeCostUsd: 0,
    gasCostUsd: 0,
    totalCostUsd: 0,
    executionDurationSec: 60,
    route: {},
  };
}

export async function computeOpportunityContext(walletAddress: `0x${string}`) {
  const [positions, opportunities] = await Promise.all([
    getAaveStablePositions(walletAddress),
    getAaveStableOpportunities(),
  ]);

  return {
    positions,
    opportunities,
  };
}

export async function selectBestCandidate(params: {
  walletAddress: `0x${string}`;
  policy: StrategyPolicy;
}) {
  const { walletAddress, policy } = params;
  const { positions, opportunities } = await computeOpportunityContext(walletAddress);
  const candidatePool: RebalanceCandidate[] = [];

  const sourcePositions = positions
    .filter((position) => position.balanceUsd >= 25)
    .sort((left, right) => right.balanceUsd - left.balanceUsd)
    .slice(0, 3);

  for (const sourcePosition of sourcePositions) {
    const competingOpportunities = opportunities
      .filter((opportunity) => {
        const samePosition =
          opportunity.chainId === sourcePosition.chainId &&
          opportunity.assetAddress.toLowerCase() === sourcePosition.assetAddress.toLowerCase() &&
          sourcePosition.protocol === opportunity.protocol;

        return !samePosition && opportunity.apy > sourcePosition.apy + 0.1;
      })
      .slice(0, 6);

    const routeCostByOpportunity = new Map<string, RebalanceCandidate["routeCost"]>();

    await Promise.all(
      competingOpportunities.map(async (opportunity) => {
        if (
          opportunity.chainId === sourcePosition.chainId &&
          opportunity.assetAddress.toLowerCase() === sourcePosition.assetAddress.toLowerCase()
        ) {
          routeCostByOpportunity.set(opportunity.id, createSyntheticRouteCost(sourcePosition));
          return;
        }

        try {
          const quote = await getBestRouteQuote({
            fromChainId: sourcePosition.chainId,
            toChainId: opportunity.chainId,
            fromTokenAddress: sourcePosition.assetAddress,
            toTokenAddress: opportunity.assetAddress,
            fromAmount: sourcePosition.balance,
            fromAddress: walletAddress,
            toAddress: walletAddress,
            slippage: policy.slippageBps,
          });

          routeCostByOpportunity.set(opportunity.id, quote.routeCost);
        } catch {
          return;
        }
      }),
    );

    candidatePool.push(
      ...rankCandidates({
        currentApy: sourcePosition.apy,
        amountUsd: sourcePosition.balanceUsd,
        opportunities: competingOpportunities,
        routeCostByOpportunity,
        policy,
        sourcePosition,
      }),
    );
  }

  return {
    positions,
    opportunities,
    candidates: candidatePool.sort((left, right) => right.expectedNetBenefitUsd - left.expectedNetBenefitUsd),
  };
}

export async function buildExecutionPlan(params: {
  walletAddress: `0x${string}`;
  candidate: RebalanceCandidate;
}): Promise<ExecutionPlan> {
  const { walletAddress, candidate } = params;
  const txSteps: TransactionPlanStep[] = [];
  const route = candidate.routeCost.route as unknown as Route | undefined;

  if (candidate.sourcePosition.protocol !== "wallet") {
    txSteps.push(
      buildAaveWithdrawStep({
        chainId: candidate.sourcePosition.chainId,
        assetAddress: candidate.sourcePosition.assetAddress,
        amount: candidate.amount,
        walletAddress,
        assetSymbol: candidate.sourcePosition.assetSymbol,
      }),
    );
  }

  if (route?.steps?.length) {
    const approvalAddress = route.steps[0].estimate.approvalAddress as `0x${string}` | undefined;
    if (approvalAddress) {
      const allowance = await checkTokenAllowance({
        chainId: candidate.sourcePosition.chainId,
        tokenAddress: candidate.sourcePosition.assetAddress,
        owner: walletAddress,
        spender: approvalAddress,
      });

      if (allowance < candidate.amount) {
        txSteps.push(
          await prepareApprovalTransaction({
            chainId: candidate.sourcePosition.chainId,
            tokenAddress: candidate.sourcePosition.assetAddress,
            spender: approvalAddress,
            amount: candidate.amount,
            assetSymbol: candidate.sourcePosition.assetSymbol,
          }),
        );
      }
    }

    txSteps.push(await buildLifiBridgeStep(route));
  }

  const depositAmount = route?.toAmountMin ? BigInt(route.toAmountMin) : candidate.amount;
  const poolAddress = candidate.destinationOpportunity.metadata.poolAddress as `0x${string}`;

  const allowanceToPool = await checkTokenAllowance({
    chainId: candidate.destinationOpportunity.chainId,
    tokenAddress: candidate.destinationOpportunity.assetAddress,
    owner: walletAddress,
    spender: poolAddress,
  }).catch(() => 0n);

  if (allowanceToPool < depositAmount) {
    txSteps.push(
      await prepareApprovalTransaction({
        chainId: candidate.destinationOpportunity.chainId,
        tokenAddress: candidate.destinationOpportunity.assetAddress,
        spender: poolAddress,
        amount: depositAmount,
        assetSymbol: candidate.destinationOpportunity.assetSymbol,
      }),
    );
  }

  txSteps.push(
    buildAaveDepositStep({
      chainId: candidate.destinationOpportunity.chainId,
      assetAddress: candidate.destinationOpportunity.assetAddress,
      amount: depositAmount,
      walletAddress,
      assetSymbol: candidate.destinationOpportunity.assetSymbol,
    }),
  );

  await Promise.all(
    txSteps.map(async (step) => {
      if (!step.estimatedGasUsd && step.data) {
        step.estimatedGasUsd = await estimateGasUsdForStep(step, walletAddress).catch(() => undefined);
      }
    }),
  );

  return {
    routeId: candidate.routeCost.routeId,
    sourceChainId: candidate.sourcePosition.chainId,
    destinationChainId: candidate.destinationOpportunity.chainId,
    sourceProtocol: candidate.sourcePosition.protocolLabel,
    destinationProtocol: candidate.destinationOpportunity.protocolLabel,
    sourceAsset: candidate.sourcePosition.assetSymbol,
    destinationAsset: candidate.destinationOpportunity.assetSymbol,
    amount: candidate.amount.toString(),
    amountUsd: candidate.amountUsd,
    expectedApyDelta: candidate.expectedApyDelta,
    expectedNetBenefitUsd: candidate.expectedNetBenefitUsd,
    bridgeCostUsd: candidate.routeCost.bridgeCostUsd,
    gasCostUsd: candidate.routeCost.gasCostUsd + txSteps.reduce((sum, step) => sum + (step.estimatedGasUsd ?? 0), 0),
    slippageBps: Math.round(candidate.scoreBreakdown.slippagePenalty * 100),
    rationale: candidate.rationale,
    routeTool: candidate.routeCost.tool,
    routeSummary:
      route?.steps?.[0]?.toolDetails?.name
        ? `${route.steps[0].toolDetails.name} via LI.FI`
        : `Direct move into ${AAVE_PROTOCOL_LABEL}`,
    txSteps,
  };
}

export async function buildDecision(params: {
  walletAddress: `0x${string}`;
  policy: StrategyPolicy;
  lastRun?: { completedAt?: Date | null } | null;
  recentDecisionTimestamps?: { createdAt: Date }[];
}) {
  const { walletAddress, policy, lastRun, recentDecisionTimestamps = [] } = params;
  const { positions, opportunities, candidates } = await selectBestCandidate({
    walletAddress,
    policy,
  });

  const candidate = candidates[0];
  if (!candidate) {
    return {
      positions,
      opportunities,
      candidate: undefined,
      policyResult: {
        allowed: false,
        requiresHumanApproval: false,
        status: "NO_ACTION",
        reasons: ["No rebalance candidate cleared the APY improvement threshold."],
      } satisfies PolicyResult,
      executionPlan: undefined,
    };
  }

  const policyResult = evaluatePolicy({
    policy,
    candidate,
    lastRun: (lastRun as never) ?? undefined,
    recentDecisions: recentDecisionTimestamps as never,
  });

  const executionPlan = policyResult.allowed
    ? await buildExecutionPlan({
        walletAddress,
        candidate,
      })
    : undefined;

  return {
    positions,
    opportunities,
    candidate,
    policyResult,
    executionPlan,
  };
}
