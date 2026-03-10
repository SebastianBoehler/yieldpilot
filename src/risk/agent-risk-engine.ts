import type { AgentActionRequest, RiskEvaluationContext, RiskEvaluationResult, RiskPolicy } from "@/agent/types";

function includesIgnoreCase(values: string[], value?: string) {
  if (!value) {
    return false;
  }

  return values.some((entry) => entry.toLowerCase() === value.toLowerCase());
}

export function evaluateAgentActionRisk(params: {
  policy: RiskPolicy;
  request: AgentActionRequest;
  context: RiskEvaluationContext;
}): RiskEvaluationResult {
  const { policy, request, context } = params;
  const reasons: string[] = [];

  if (policy.emergencyPause) {
    reasons.push("Emergency pause is enabled.");
  }

  if (context.circuitBreakerOpen) {
    reasons.push("Circuit breaker is open.");
  }

  if (!policy.approvedActionKinds.includes(request.kind)) {
    reasons.push("Action kind is not allowlisted.");
  }

  if (!policy.approvedChains.includes(request.chainId)) {
    reasons.push("Chain is not allowlisted.");
  }

  if (!includesIgnoreCase(policy.approvedProtocols, request.protocol)) {
    reasons.push("Protocol is not allowlisted.");
  }

  if (request.assetSymbol && !includesIgnoreCase(policy.approvedAssets, request.assetSymbol)) {
    reasons.push("Asset is not allowlisted.");
  }

  if (
    request.contractAddress &&
    policy.approvedContractAddresses.length > 0 &&
    !includesIgnoreCase(policy.approvedContractAddresses, request.contractAddress)
  ) {
    reasons.push("Contract address is not allowlisted.");
  }

  if (
    request.methodSelector &&
    policy.approvedMethodSelectors.length > 0 &&
    !includesIgnoreCase(policy.approvedMethodSelectors, request.methodSelector)
  ) {
    reasons.push("Method selector is not allowlisted.");
  }

  if ((request.amountUsd ?? 0) > policy.maxTransactionUsd) {
    reasons.push("Action exceeds the per-transaction notional cap.");
  }

  if (context.dailyNotionalUsd + (request.amountUsd ?? 0) > policy.maxDailyNotionalUsd) {
    reasons.push("Daily notional limit would be exceeded.");
  }

  if (context.dailyActionCount + 1 > policy.maxDailyActions) {
    reasons.push("Daily action limit would be exceeded.");
  }

  if (request.kind === "approve" && (request.amountUsd ?? 0) > policy.maxApprovalUsd) {
    reasons.push("Approval exceeds the approval USD cap.");
  }

  const rawAmount = request.amount ? Number(request.amount) : 0;
  if (request.kind === "approve" && Number.isFinite(rawAmount) && rawAmount > policy.maxApprovalAmount) {
    reasons.push("Approval amount exceeds the configured cap.");
  }

  if ((request.slippageBps ?? 0) > policy.maxSlippageBps) {
    reasons.push("Requested slippage exceeds the maximum.");
  }

  if ((request.leverage ?? 1) > policy.maxLeverage) {
    reasons.push("Requested leverage exceeds the maximum.");
  }

  if ((request.kind === "perp_open" || request.kind === "perp_add_collateral" || request.kind === "borrow") && context.collateralHealthFactorBps !== undefined && context.collateralHealthFactorBps < policy.collateralHealthThresholdBps) {
    reasons.push("Collateral health is below the required threshold.");
  }

  if (request.kind === "nft_buy" && (request.amountUsd ?? 0) > policy.maxNftPurchaseUsd) {
    reasons.push("NFT purchase exceeds the configured cap.");
  }

  if ((request.kind === "yield_deposit" || request.kind === "stake") && (request.amountUsd ?? 0) > policy.maxVaultDepositUsd) {
    reasons.push("Vault or staking deposit exceeds the configured cap.");
  }

  if (context.openPositionCount >= policy.maxOpenPositions && (request.kind === "perp_open" || request.kind === "borrow")) {
    reasons.push("Max open positions limit reached.");
  }

  if (!context.liveExecutionEnabled) {
    reasons.push("Live execution is disabled.");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    actionLimitReached: reasons.some((reason) => reason.includes("action limit")),
    tradeLimitReached: reasons.some((reason) => reason.includes("notional") || reason.includes("cap")),
  };
}
