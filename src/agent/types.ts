import type { RunStatus, TransactionStatus } from "@prisma/client";
import type { TransactionPlanStep } from "@/types/domain";

export type AgentStrategyKey = "yield-agent" | "perps-agent" | "nft-agent" | "vault-agent";

export type AgentActionKind =
  | "swap"
  | "bridge_swap"
  | "lend_deposit"
  | "lend_withdraw"
  | "borrow"
  | "repay"
  | "yield_deposit"
  | "yield_withdraw"
  | "stake"
  | "unstake"
  | "claim_rewards"
  | "perp_open"
  | "perp_close"
  | "perp_reduce"
  | "perp_add_collateral"
  | "perp_remove_collateral"
  | "nft_mint"
  | "nft_buy"
  | "nft_list"
  | "nft_cancel"
  | "approve"
  | "permit";

export type AgentActionRequest = {
  strategyKey: AgentStrategyKey;
  title: string;
  kind: AgentActionKind;
  protocol: string;
  chainId: number;
  accountAddress: `0x${string}`;
  assetSymbol?: string;
  amount?: string;
  amountUsd?: number;
  receiver?: `0x${string}`;
  slippageBps?: number;
  leverage?: number;
  maxFeeUsd?: number;
  contractAddress?: `0x${string}`;
  methodSelector?: `0x${string}`;
  relatedPositionId?: string;
  metadata: Record<string, unknown>;
};

export type AgentCycleInput = {
  walletAddress: `0x${string}`;
  userId: string;
  strategyId: string;
  strategyKey: AgentStrategyKey;
  liveExecutionEnabled: boolean;
  maxReasoningSteps: number;
  maxActionsPerCycle: number;
  timeoutMs: number;
};

export type AgentCycleTraceEvent = {
  step: string;
  message: string;
  payload?: Record<string, unknown>;
};

export type ProtocolAdapterCapabilities = {
  protocol: string;
  supportedActions: AgentActionKind[];
  simulation: boolean;
  liveExecution: boolean;
  gasSponsorship: boolean;
  smartAccounts: boolean;
  eip7702: boolean;
  permits: boolean;
  notes: string[];
};

export type ActionQuote = {
  request: AgentActionRequest;
  amountUsd?: number;
  expectedOutputAmount?: string;
  expectedOutputUsd?: number;
  estimatedFeeUsd?: number;
  estimatedGasUsd?: number;
  routeId?: string;
  routeSummary?: string;
  metadata: Record<string, unknown>;
};

export type ActionValidation = {
  valid: boolean;
  requiresApproval: boolean;
  reasons: string[];
  metadata: Record<string, unknown>;
};

export type ActionSimulation = {
  simulated: boolean;
  success: boolean;
  warnings: string[];
  metadata: Record<string, unknown>;
};

export type SponsorshipQuote = {
  eligible: boolean;
  sponsored: boolean;
  mode: "none" | "paymaster" | "fallback";
  metadata: Record<string, unknown>;
  reason?: string;
};

export type ActionExecutionBundle = {
  mode: "eoa" | "erc4337" | "delegated-eip7702";
  routeTool?: string;
  txSteps: TransactionPlanStep[];
  sponsorship: SponsorshipQuote;
  metadata: Record<string, unknown>;
};

export type ActionExecutionResult = {
  status: TransactionStatus | "UNSUPPORTED";
  bundleMode: ActionExecutionBundle["mode"];
  sponsorship: SponsorshipQuote;
  transactionHash?: string;
  explorerUrl?: string;
  error?: string;
  metadata: Record<string, unknown>;
};

export type ActionStatusResult = {
  status: "pending" | "confirmed" | "failed" | "unsupported";
  message: string;
  metadata: Record<string, unknown>;
};

export type ProtocolAdapterContext = {
  walletAddress: `0x${string}`;
  executionMode: "dry-run" | "live";
};

export interface ProtocolAdapter {
  readonly protocol: string;
  quoteAction(request: AgentActionRequest, context: ProtocolAdapterContext): Promise<ActionQuote>;
  validateAction(request: AgentActionRequest, context: ProtocolAdapterContext): Promise<ActionValidation>;
  simulateAction(request: AgentActionRequest, context: ProtocolAdapterContext): Promise<ActionSimulation>;
  executeAction(request: AgentActionRequest, context: ProtocolAdapterContext): Promise<ActionExecutionBundle>;
  getActionStatus(request: AgentActionRequest, transactionHash?: string): Promise<ActionStatusResult>;
  getCapabilities(): ProtocolAdapterCapabilities;
}

export type RiskPolicy = {
  strategyId: string;
  strategyKey: AgentStrategyKey;
  approvedChains: number[];
  approvedProtocols: string[];
  approvedAssets: string[];
  approvedContractAddresses: string[];
  approvedMethodSelectors: string[];
  approvedActionKinds: AgentActionKind[];
  maxTransactionUsd: number;
  maxDailyNotionalUsd: number;
  maxSlippageBps: number;
  maxApprovalUsd: number;
  maxApprovalAmount: number;
  maxActionsPerCycle: number;
  maxDailyActions: number;
  maxReasoningSteps: number;
  cycleTimeoutMs: number;
  maxLeverage: number;
  maxOpenPositions: number;
  maxNftPurchaseUsd: number;
  maxVaultDepositUsd: number;
  collateralHealthThresholdBps: number;
  requireSimulation: boolean;
  liveExecutionEnabled: boolean;
  enableSmartAccounts: boolean;
  enableGasSponsorship: boolean;
  emergencyPause: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerWindowMinutes: number;
};

export type RiskEvaluationContext = {
  dailyActionCount: number;
  dailyNotionalUsd: number;
  openPositionCount: number;
  liveExecutionEnabled: boolean;
  circuitBreakerOpen: boolean;
  collateralHealthFactorBps?: number;
};

export type RiskEvaluationResult = {
  allowed: boolean;
  reasons: string[];
  actionLimitReached: boolean;
  tradeLimitReached: boolean;
};

export type AgentCycleActionResult = {
  request: AgentActionRequest;
  quote?: ActionQuote;
  validation?: ActionValidation;
  simulation?: ActionSimulation;
  plannedBundle?: ActionExecutionBundle;
  execution?: ActionExecutionResult;
  blockedReasons?: string[];
};

export type StrategyModuleResult = {
  strategyKey: AgentStrategyKey;
  summary: string;
  candidateCount: number;
  actions: AgentActionRequest[];
  metadata: Record<string, unknown>;
};

export type AgentCycleRuntimeResult = {
  status: RunStatus;
  summary: string;
  strategyKey: AgentStrategyKey;
  liveExecutionEnabled: boolean;
  cycleId: string;
  actions: AgentCycleActionResult[];
  trace: AgentCycleTraceEvent[];
};
