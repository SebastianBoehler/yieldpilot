import type { Route } from "@lifi/types";
import { getRoutes, getStepTransaction } from "@lifi/sdk";
import { ensureLifiConfig } from "@/lib/lifi/client";
import type { RouteCostEstimate, TransactionPlanStep } from "@/types/domain";

export type QuoteRequest = {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: `0x${string}`;
  toTokenAddress: `0x${string}`;
  fromAmount: string;
  fromAddress: `0x${string}`;
  toAddress: `0x${string}`;
  slippage: number;
};

export async function getBestRouteQuote(request: QuoteRequest): Promise<{ route: Route; routeCost: RouteCostEstimate }> {
  ensureLifiConfig();

  const response = await getRoutes({
    fromChainId: request.fromChainId,
    toChainId: request.toChainId,
    fromTokenAddress: request.fromTokenAddress,
    toTokenAddress: request.toTokenAddress,
    fromAmount: request.fromAmount,
    fromAddress: request.fromAddress,
    toAddress: request.toAddress,
    options: {
      slippage: request.slippage / 10_000,
    },
  });

  const route = response.routes[0];
  if (!route) {
    throw new Error("LI.FI did not return a route.");
  }

  const firstStep = route.steps[0];
  const bridgeCostUsd = firstStep.estimate.feeCosts?.reduce((sum, cost) => sum + Number(cost.amountUSD ?? 0), 0) ?? 0;
  const gasCostUsd = firstStep.estimate.gasCosts?.reduce((sum, gas) => sum + Number(gas.amountUSD ?? 0), 0) ?? 0;

  return {
    route,
    routeCost: {
      routeId: route.id,
      routeLabel: `${route.fromToken.symbol} ${route.fromChainId} -> ${route.toToken.symbol} ${route.toChainId}`,
      tool: firstStep.tool,
      bridgeCostUsd,
      gasCostUsd,
      totalCostUsd: bridgeCostUsd + gasCostUsd,
      executionDurationSec: firstStep.estimate.executionDuration,
      approvalAddress: firstStep.estimate.approvalAddress,
      route: route as unknown as Record<string, unknown>,
    },
  };
}

export async function buildLifiBridgeStep(route: Route): Promise<TransactionPlanStep> {
  ensureLifiConfig();

  const currentStep = await getStepTransaction(route.steps[0]);
  const txRequest = currentStep.transactionRequest;
  if (!txRequest?.to) {
    throw new Error("LI.FI could not prepare the bridge transaction.");
  }

  return {
    stepKey: `lifi-bridge-${route.id}`,
    title: "Bridge and swap with LI.FI",
    transactionType: route.fromChainId === route.toChainId ? "swap" : "bridge",
    chainId: route.fromChainId,
    to: txRequest.to as `0x${string}`,
    data: txRequest.data as `0x${string}` | undefined,
    value: txRequest.value?.toString() ?? "0",
    spenderAddress: route.steps[0].estimate.approvalAddress as `0x${string}` | undefined,
    description: `${route.steps[0].toolDetails.name} route prepared by LI.FI.`,
    protocol: "LI.FI",
    assetSymbol: route.fromToken.symbol,
    estimatedGasUsd: route.steps[0].estimate.gasCosts?.reduce((sum, gas) => sum + Number(gas.amountUSD), 0),
    metadata: {
      routeId: route.id,
      tool: route.steps[0].tool,
      includedSteps: route.steps[0].includedSteps.map((step) => ({
        type: step.type,
        tool: step.tool,
        fromChainId: step.action.fromChainId,
        toChainId: step.action.toChainId,
        fromToken: step.action.fromToken.symbol,
        toToken: step.action.toToken.symbol,
      })),
      approvalAddress: route.steps[0].estimate.approvalAddress,
    },
  };
}
