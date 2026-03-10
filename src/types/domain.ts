import type { ApprovalStatus, DecisionStatus, RiskProfile, RunStatus, StrategyMode, TransactionStatus } from "@prisma/client";

export type SupportedProtocolKey = "aave-v3";
export type SupportedAssetKey = "USDC" | "USDT" | "DAI";
export type SupportedChainKey = "arbitrum" | "base" | "optimism";

export type ChainConfig = {
  id: number;
  key: SupportedChainKey;
  label: string;
  rpcUrl: string;
  nativeSymbol: string;
  blockExplorer: string;
  poolAddress: `0x${string}`;
  poolAddressesProvider: `0x${string}`;
  protocolDataProvider: `0x${string}`;
  uiPoolDataProvider: `0x${string}`;
  assets: Record<string, `0x${string}`>;
};

export type AssetMetadata = {
  symbol: SupportedAssetKey;
  address: `0x${string}`;
  decimals: number;
};

export type YieldOpportunity = {
  id: string;
  protocol: SupportedProtocolKey;
  protocolLabel: string;
  chainId: number;
  chainKey: SupportedChainKey;
  chainLabel: string;
  assetSymbol: string;
  assetAddress: `0x${string}`;
  apy: number;
  liquidityRate: string;
  availableLiquidityUsd: number;
  totalSupplyUsd: number;
  tvlUsd: number;
  reserveFactor: number;
  priceUsd: number;
  riskPenalty: number;
  metadata: Record<string, unknown>;
};

export type PortfolioPosition = {
  id: string;
  walletAddress: `0x${string}`;
  chainId: number;
  chainKey: SupportedChainKey;
  chainLabel: string;
  protocol: "wallet" | SupportedProtocolKey;
  protocolLabel: string;
  assetSymbol: string;
  assetAddress: `0x${string}`;
  balance: string;
  balanceFormatted: number;
  balanceUsd: number;
  apy: number;
  positionType: "idle" | "lending";
  metadata: Record<string, unknown>;
};

export type StrategyPolicy = {
  strategyId: string;
  mode: StrategyMode;
  riskProfile: RiskProfile;
  rebalanceThresholdBps: number;
  maxRebalanceUsd: number;
  maxDailyMovedUsd: number;
  cooldownMinutes: number;
  slippageBps: number;
  dryRun: boolean;
  emergencyPause: boolean;
  approvedChains: number[];
  approvedProtocols: string[];
  approvedAssets: string[];
  protocolPermanentApprovals: string[];
  protocolAmountThresholds: Record<string, number>;
  maxTransactionUsd: number;
  minNetBenefitUsd: number;
  maxSlippageBps: number;
  dailyMovedLimitUsd?: number | null;
  stopLossBps?: number | null;
  autoApproveTrustedProtocols: boolean;
  allowUnlimitedApprovals: boolean;
};

export type RouteCostEstimate = {
  routeId: string;
  routeLabel: string;
  tool: string;
  bridgeCostUsd: number;
  gasCostUsd: number;
  totalCostUsd: number;
  executionDurationSec: number;
  approvalAddress?: string;
  route: Record<string, unknown>;
};

export type ScoreBreakdown = {
  rawApy: number;
  riskPenalty: number;
  bridgeCostPenalty: number;
  gasPenalty: number;
  slippagePenalty: number;
  liquidityBonus: number;
  chainPreference: number;
  finalScore: number;
};

export type RebalanceCandidate = {
  sourcePosition: PortfolioPosition;
  destinationOpportunity: YieldOpportunity;
  amount: bigint;
  amountUsd: number;
  expectedApyDelta: number;
  expectedNetBenefitUsd: number;
  routeCost: RouteCostEstimate;
  scoreBreakdown: ScoreBreakdown;
  rationale: string;
};

export type PolicyResult = {
  allowed: boolean;
  requiresHumanApproval: boolean;
  status: DecisionStatus;
  reasons: string[];
};

export type TransactionPlanStep = {
  stepKey: string;
  title: string;
  transactionType: "withdraw" | "approve" | "bridge" | "swap" | "deposit";
  chainId: number;
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: string;
  spenderAddress?: `0x${string}`;
  description: string;
  protocol: string;
  assetSymbol: string;
  estimatedGasUsd?: number;
  metadata: Record<string, unknown>;
};

export type ExecutionPlan = {
  routeId: string;
  sourceChainId: number;
  destinationChainId: number;
  sourceProtocol: string;
  destinationProtocol: string;
  sourceAsset: string;
  destinationAsset: string;
  amount: string;
  amountUsd: number;
  expectedApyDelta: number;
  expectedNetBenefitUsd: number;
  bridgeCostUsd: number;
  gasCostUsd: number;
  slippageBps: number;
  rationale: string;
  routeTool: string;
  routeSummary: string;
  txSteps: TransactionPlanStep[];
};

export type AgentCycleInput = {
  walletAddress: `0x${string}`;
  userId: string;
  strategyId: string;
  mode: StrategyMode;
};

export type AgentCycleResult = {
  runStatus: RunStatus;
  summary: string;
  decisionStatus: DecisionStatus;
  positions: PortfolioPosition[];
  opportunities: YieldOpportunity[];
  candidate?: RebalanceCandidate;
  policyResult?: PolicyResult;
  executionPlan?: ExecutionPlan;
  approvalRequestId?: string;
  transactionHashes?: string[];
  error?: string;
};

export type DashboardSnapshot = {
  walletAddress?: string;
  totalPortfolioUsd: number;
  effectiveApy: number;
  pendingApprovals: number;
  autonomousModeEnabled: boolean;
  positions: PortfolioPosition[];
  opportunityCount: number;
  currentAllocation: Array<{
    label: string;
    value: number;
  }>;
  byChain: Array<{
    label: string;
    value: number;
  }>;
  lastDecision?: {
    status: DecisionStatus;
    summary: string;
    createdAt: string;
  };
  lastRebalance?: {
    summary: string;
    createdAt: string;
  };
  loopStatus: {
    lastRunAt?: string;
    status?: RunStatus;
    scheduleLabel: string;
  };
  bestOpportunity?: YieldOpportunity;
};

export type ApprovalQueueItem = {
  id: string;
  status: ApprovalStatus;
  createdAt: string;
  expiresAt?: string | null;
  executionPlan: ExecutionPlan;
  requestedAction: Record<string, unknown>;
};

export type ExecutionLogEntry = {
  id: string;
  level: string;
  message: string;
  createdAt: string;
  context: Record<string, unknown>;
};

export type TransactionExecutionResult = {
  status: TransactionStatus;
  hash?: string;
  chainId: number;
  explorerUrl?: string;
  error?: string;
};
