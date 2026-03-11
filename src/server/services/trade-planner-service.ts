import { getProtocolAdapter } from "@/protocols/adapter-registry";
import { evaluateAgentActionRisk } from "@/risk/agent-risk-engine";
import { getCircuitBreakerState, getDailyActionStats, getOpenPositionCount } from "@/storage/agent-store";
import { createTradePlanRecord } from "@/storage/virtuals-store";
import { runYieldStrategyModule } from "@/agent/strategies/yield-agent";
import type { AgentActionRequest, AgentCycleActionResult } from "@/agent/types";
import { env } from "@/lib/config/env";
import { toRiskPolicy } from "@/agent/policy";
import { buildDefaultStrategyPolicy, ensureUserStrategy, toStrategyPolicy } from "@/server/services/strategy-service";
import { buildExecutionPlanFromActionResults } from "@/server/services/trade-plan-serializer";
import type { AcpOfferingResult, TradePlanOutput, TradePlanRequest } from "@/types/virtuals";

function buildExecutionUrl(walletAddress: `0x${string}`) {
  return `${env.ACP_BASE_URL}/dashboard?wallet=${walletAddress}&walletType=evm`;
}

async function buildSpotSwapPlan(input: Extract<TradePlanRequest, { offeringKey: "build_spot_swap_plan" }>): Promise<TradePlanOutput> {
  const base = await ensureUserStrategy(input.walletAddress);
  const policy = base ? toStrategyPolicy(base.strategy) : buildDefaultStrategyPolicy();
  const riskPolicy = toRiskPolicy(policy);
  const adapter = getProtocolAdapter("lifi");

  const request: AgentActionRequest = {
    strategyKey: "yield-agent",
    title:
      input.fromChainId === input.toChainId
        ? `Swap ${input.fromTokenSymbol ?? "asset"} into ${input.toTokenSymbol ?? "asset"}`
        : `Bridge and swap ${input.fromTokenSymbol ?? "asset"} into ${input.toTokenSymbol ?? "asset"}`,
    kind: input.fromChainId === input.toChainId ? "swap" : "bridge_swap",
    protocol: "lifi",
    chainId: input.fromChainId,
    accountAddress: input.walletAddress,
    assetSymbol: input.fromTokenSymbol,
    amount: input.amount,
    amountUsd: input.amountUsd,
    receiver: input.walletAddress,
    slippageBps: input.slippageBps ?? policy.slippageBps,
    metadata: {
      fromTokenAddress: input.fromTokenAddress,
      toTokenAddress: input.toTokenAddress,
      fromAmount: input.amount,
      toChainId: input.toChainId,
    },
  };

  const [quote, validation, simulation, plannedBundle] = await Promise.all([
    adapter.quoteAction(request, {
      walletAddress: input.walletAddress,
      executionMode: "dry-run",
    }),
    adapter.validateAction(request, {
      walletAddress: input.walletAddress,
      executionMode: "dry-run",
    }),
    adapter.simulateAction(request, {
      walletAddress: input.walletAddress,
      executionMode: "dry-run",
    }),
    adapter.executeAction(request, {
      walletAddress: input.walletAddress,
      executionMode: "dry-run",
    }),
  ]);

  let dailyStats = { count: 0, notionalUsd: 0 };
  let openPositionCount = 0;
  let circuitBreaker = { isOpen: false };

  if (base?.strategy) {
    [dailyStats, openPositionCount, circuitBreaker] = await Promise.all([
      getDailyActionStats(base.strategy.id),
      getOpenPositionCount(base.strategy.id),
      getCircuitBreakerState(base.strategy.id),
    ]);
  }

  const risk = evaluateAgentActionRisk({
    policy: riskPolicy,
    request: {
      ...request,
      amountUsd: quote.amountUsd ?? request.amountUsd,
    },
    context: {
      dailyActionCount: dailyStats.count,
      dailyNotionalUsd: dailyStats.notionalUsd,
      openPositionCount,
      liveExecutionEnabled: false,
      circuitBreakerOpen: circuitBreaker.isOpen,
    },
  });

  const reasons = [...validation.reasons, ...risk.reasons, ...(simulation.success ? [] : simulation.warnings)];
  const executionPlan = {
    routeId: quote.routeId ?? "lifi-route",
    sourceChainId: input.fromChainId,
    destinationChainId: input.toChainId,
    sourceProtocol: "wallet",
    destinationProtocol: "wallet",
    sourceAsset: input.fromTokenSymbol ?? input.fromTokenAddress,
    destinationAsset: input.toTokenSymbol ?? input.toTokenAddress,
    amount: input.amount,
    amountUsd: quote.amountUsd ?? input.amountUsd ?? 0,
    expectedApyDelta: 0,
    expectedNetBenefitUsd: 0,
    bridgeCostUsd: quote.estimatedFeeUsd ?? 0,
    gasCostUsd: quote.estimatedGasUsd ?? 0,
    slippageBps: input.slippageBps ?? policy.slippageBps,
    rationale: quote.routeSummary ?? "LI.FI prepared a dry-run route for the requested swap.",
    routeTool: plannedBundle.routeTool ?? "lifi",
    routeSummary: quote.routeSummary ?? "LI.FI route",
    txSteps: plannedBundle.txSteps,
  };

  return {
    planType: "build_spot_swap_plan",
    walletAddress: input.walletAddress,
    summary: reasons.length
      ? `YieldPilot produced a dry-run LI.FI route but policy or validation blockers remain: ${reasons.join(" ")}`
      : "YieldPilot produced a dry-run LI.FI route and handoff plan. Execution still requires explicit approval in YieldPilot.",
    generatedAt: new Date().toISOString(),
    policyAllowed: reasons.length === 0,
    requiresApproval: true,
    reasons,
    routeSummary: executionPlan.routeSummary,
    routeTool: executionPlan.routeTool,
    estimatedGasUsd: executionPlan.gasCostUsd,
    estimatedBridgeCostUsd: executionPlan.bridgeCostUsd,
    estimatedFeeUsd: quote.estimatedFeeUsd,
    slippageBps: executionPlan.slippageBps,
    executionPlan,
    executionUrl: buildExecutionUrl(input.walletAddress),
  };
}

async function buildRebalancePlan(input: Extract<TradePlanRequest, { offeringKey: "build_rebalance_plan" }>): Promise<TradePlanOutput> {
  const base = await ensureUserStrategy(input.walletAddress);
  const policy = base ? toStrategyPolicy(base.strategy) : buildDefaultStrategyPolicy();
  const strategy = await runYieldStrategyModule({
    walletAddress: input.walletAddress,
    policy,
  });

  const actions = await Promise.all(
    strategy.actions.map(async (action) => {
      const adapter = getProtocolAdapter(action.protocol);
      const bundle = await adapter.executeAction(action, {
        walletAddress: input.walletAddress,
        executionMode: "dry-run",
      });

      return {
        request: action,
        plannedBundle: bundle,
      } satisfies AgentCycleActionResult;
    }),
  );

  const executionPlan = buildExecutionPlanFromActionResults(actions, strategy.candidate);
  const reasons = executionPlan ? [] : ["YieldPilot found no rebalance candidate that cleared the configured thresholds."];

  return {
    planType: "build_rebalance_plan",
    walletAddress: input.walletAddress,
    summary: executionPlan
      ? strategy.summary
      : "YieldPilot did not find a current rebalance opportunity that cleared policy and route thresholds.",
    generatedAt: new Date().toISOString(),
    policyAllowed: Boolean(executionPlan),
    requiresApproval: Boolean(executionPlan),
    reasons,
    routeSummary: executionPlan?.routeSummary,
    routeTool: executionPlan?.routeTool,
    estimatedGasUsd: executionPlan?.gasCostUsd,
    estimatedBridgeCostUsd: executionPlan?.bridgeCostUsd,
    estimatedFeeUsd: executionPlan?.bridgeCostUsd,
    slippageBps: executionPlan?.slippageBps,
    executionPlan,
    executionUrl: buildExecutionUrl(input.walletAddress),
  };
}

export async function executeTradePlannerOffering(input: TradePlanRequest): Promise<AcpOfferingResult> {
  const payload = input.offeringKey === "build_spot_swap_plan" ? await buildSpotSwapPlan(input) : await buildRebalancePlan(input);
  const record = await createTradePlanRecord({
    input: input as unknown as Record<string, unknown>,
    output: payload,
  });

  return {
    agentKey: "yieldpilot-trade-planner",
    offeringKey: input.offeringKey,
    title: input.offeringKey === "build_spot_swap_plan" ? "YieldPilot spot swap plan" : "YieldPilot rebalance plan",
    payload: {
      ...payload,
      planId: record.id,
    },
    createdAt: payload.generatedAt,
  };
}
