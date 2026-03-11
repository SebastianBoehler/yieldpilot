import type { ExecutionPlan, SupportedChainKey } from "@/types/domain";

export type VirtualsAgentKey = "yieldpilot-research" | "yieldpilot-trade-planner";

export type VirtualsOfferingKey =
  | "analyze_token_launch"
  | "detect_whale_movements"
  | "generate_trade_signal"
  | "build_spot_swap_plan"
  | "build_rebalance_plan";

export type VirtualsResourceKey =
  | "latest_signals"
  | "tracked_whales"
  | "recent_launches"
  | "supported_chains"
  | "methodology"
  | "signal_history";

export type ResearchSignalInput = {
  offeringKey: "analyze_token_launch" | "detect_whale_movements" | "generate_trade_signal";
  query?: string;
  walletAddress?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  chainKey?: Exclude<SupportedChainKey, "solana">;
  trackedWallets?: string[];
  maxItems?: number;
};

export type ResearchSignalOutput = {
  summary: string;
  confidence: number;
  signal: "bullish" | "bearish" | "neutral" | "watch";
  supporting_facts: string[];
  risks: string[];
  time_horizon: "intraday" | "1-7d" | "1-4w";
  generated_at: string;
};

export type LaunchAnalysis = {
  query: string;
  chainKey?: string;
  tokenAddress?: string;
  pairAddress?: string;
  dexId?: string;
  label: string;
  priceUsd?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  priceChange24hPct?: number;
  pairCreatedAt?: string;
  url?: string;
  metadata: Record<string, unknown>;
};

export type WhaleAlert = {
  label: string;
  walletAddress: string;
  chainKey: Exclude<SupportedChainKey, "solana">;
  direction: "inflow" | "outflow";
  tokenSymbol: string;
  tokenAddress?: string;
  amount: string;
  amountUsd?: number;
  counterparty?: string;
  txHash: string;
  observedAt: string;
  metadata: Record<string, unknown>;
};

export type TradePlanRequest =
  | {
      offeringKey: "build_spot_swap_plan";
      walletAddress: `0x${string}`;
      fromChainId: number;
      toChainId: number;
      fromTokenAddress: `0x${string}`;
      toTokenAddress: `0x${string}`;
      fromTokenSymbol?: string;
      toTokenSymbol?: string;
      amount: string;
      amountUsd?: number;
      slippageBps?: number;
    }
  | {
      offeringKey: "build_rebalance_plan";
      walletAddress: `0x${string}`;
    };

export type TradePlanOutput = {
  planId?: string;
  planType: TradePlanRequest["offeringKey"];
  walletAddress: `0x${string}`;
  summary: string;
  generatedAt: string;
  policyAllowed: boolean;
  requiresApproval: boolean;
  reasons: string[];
  routeSummary?: string;
  routeTool?: string;
  estimatedGasUsd?: number;
  estimatedBridgeCostUsd?: number;
  estimatedFeeUsd?: number;
  slippageBps?: number;
  executionPlan?: ExecutionPlan;
  executionUrl: string;
};

export type AcpOfferingResult =
  | {
      agentKey: "yieldpilot-research";
      offeringKey: ResearchSignalInput["offeringKey"];
      title: string;
      payload: ResearchSignalOutput & {
        launch_analysis?: LaunchAnalysis | null;
        whale_alerts?: WhaleAlert[];
      };
      createdAt: string;
    }
  | {
      agentKey: "yieldpilot-trade-planner";
      offeringKey: TradePlanRequest["offeringKey"];
      title: string;
      payload: TradePlanOutput;
      createdAt: string;
    };

export type AcpResourcePayload = {
  agentKey: VirtualsAgentKey;
  resource: VirtualsResourceKey;
  description: string;
  updatedAt: string;
  data: Record<string, unknown>;
};

export type VirtualsJobSchema = {
  title: string;
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type VirtualsJobOfferingDefinition = {
  key: VirtualsOfferingKey;
  title: string;
  description: string;
  priceUsdc: number;
  slaMinutes: number;
  requirementSchema: VirtualsJobSchema;
  deliverableSchema: VirtualsJobSchema;
};

export type VirtualsResourceDefinition = {
  key: VirtualsResourceKey;
  title: string;
  description: string;
  path: string;
};

export type VirtualsAgentDefinition = {
  key: VirtualsAgentKey;
  name: string;
  businessDescription: string;
  offerings: VirtualsJobOfferingDefinition[];
  resources: VirtualsResourceDefinition[];
};
