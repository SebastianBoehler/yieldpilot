import { env } from "@/lib/config/env";
import type { VirtualsAgentDefinition, VirtualsAgentKey, VirtualsJobOfferingDefinition, VirtualsResourceDefinition } from "@/types/virtuals";

const researchResources: VirtualsResourceDefinition[] = [
  {
    key: "latest_signals",
    title: "Latest Signals",
    description: "Recent YieldPilot research signals with confidence, horizon, and supporting facts.",
    path: "/api/virtuals/resources/latest_signals?agent=yieldpilot-research",
  },
  {
    key: "tracked_whales",
    title: "Tracked Whales",
    description: "The current whale watchlist and the most recent wallet-specific alerts YieldPilot has observed.",
    path: "/api/virtuals/resources/tracked_whales?agent=yieldpilot-research",
  },
  {
    key: "recent_launches",
    title: "Recent Launches",
    description: "Recent token launch analyses sourced from DexScreener search and pair data.",
    path: "/api/virtuals/resources/recent_launches?agent=yieldpilot-research",
  },
  {
    key: "supported_chains",
    title: "Supported Chains",
    description: "YieldPilot chain support for research and planning services.",
    path: "/api/virtuals/resources/supported_chains?agent=yieldpilot-research",
  },
  {
    key: "methodology",
    title: "Methodology",
    description: "How YieldPilot produces research signals and trade plans.",
    path: "/api/virtuals/resources/methodology?agent=yieldpilot-research",
  },
  {
    key: "signal_history",
    title: "Signal History",
    description: "Historical research outputs emitted by YieldPilot.",
    path: "/api/virtuals/resources/signal_history?agent=yieldpilot-research",
  },
];

const researchOfferings: VirtualsJobOfferingDefinition[] = [
  {
    key: "analyze_token_launch",
    title: "Analyze Token Launch",
    description: "Analyze a token launch or newly active pair with DexScreener, market context, and YieldPilot synthesis.",
    priceUsdc: env.ACP_ANALYZE_TOKEN_LAUNCH_PRICE_USDC,
    slaMinutes: 10,
    requirementSchema: {
      title: "Analyze Token Launch Request",
      type: "object",
      properties: {
        query: { type: "string", description: "Token symbol, token address, or market query to investigate." },
        chainKey: { type: "string", enum: ["base", "arbitrum", "optimism"] },
      },
      required: ["query"],
      additionalProperties: false,
    },
    deliverableSchema: {
      title: "Analyze Token Launch Response",
      type: "object",
      properties: {
        summary: { type: "string" },
        confidence: { type: "number" },
        signal: { type: "string", enum: ["bullish", "bearish", "neutral", "watch"] },
        supporting_facts: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        time_horizon: { type: "string" },
        generated_at: { type: "string", format: "date-time" },
      },
      required: ["summary", "confidence", "signal", "supporting_facts", "risks", "time_horizon", "generated_at"],
      additionalProperties: true,
    },
  },
  {
    key: "detect_whale_movements",
    title: "Detect Whale Movements",
    description: "Check a configured watchlist of wallets on Base, Arbitrum, and Optimism for recent token transfer activity.",
    priceUsdc: env.ACP_DETECT_WHALE_MOVEMENTS_PRICE_USDC,
    slaMinutes: 10,
    requirementSchema: {
      title: "Detect Whale Movements Request",
      type: "object",
      properties: {
        trackedWallets: { type: "array", items: { type: "string" }, description: "Optional wallet subset to inspect." },
        maxItems: { type: "number", description: "Optional maximum number of alerts to return." },
      },
      additionalProperties: false,
    },
    deliverableSchema: {
      title: "Detect Whale Movements Response",
      type: "object",
      properties: {
        summary: { type: "string" },
        confidence: { type: "number" },
        signal: { type: "string", enum: ["bullish", "bearish", "neutral", "watch"] },
        supporting_facts: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        time_horizon: { type: "string" },
        generated_at: { type: "string", format: "date-time" },
      },
      required: ["summary", "confidence", "signal", "supporting_facts", "risks", "time_horizon", "generated_at"],
      additionalProperties: true,
    },
  },
  {
    key: "generate_trade_signal",
    title: "Generate Trade Signal",
    description: "Generate a structured trade signal using RSS feeds, market pulse, indexes, and current supported opportunities.",
    priceUsdc: env.ACP_GENERATE_TRADE_SIGNAL_PRICE_USDC,
    slaMinutes: 10,
    requirementSchema: {
      title: "Generate Trade Signal Request",
      type: "object",
      properties: {
        query: { type: "string", description: "Signal topic, thesis, token symbol, or wallet thesis to examine." },
        walletAddress: { type: "string", description: "Optional EVM wallet used to contextualize the signal." },
      },
      additionalProperties: false,
    },
    deliverableSchema: {
      title: "Generate Trade Signal Response",
      type: "object",
      properties: {
        summary: { type: "string" },
        confidence: { type: "number" },
        signal: { type: "string", enum: ["bullish", "bearish", "neutral", "watch"] },
        supporting_facts: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        time_horizon: { type: "string" },
        generated_at: { type: "string", format: "date-time" },
      },
      required: ["summary", "confidence", "signal", "supporting_facts", "risks", "time_horizon", "generated_at"],
      additionalProperties: true,
    },
  },
];

const tradePlannerOfferings: VirtualsJobOfferingDefinition[] = [
  {
    key: "build_spot_swap_plan",
    title: "Build Spot Swap Plan",
    description: "Build a non-custodial LI.FI spot swap or bridge-and-swap plan, then hand off to YieldPilot for execution approval.",
    priceUsdc: env.ACP_BUILD_SPOT_SWAP_PLAN_PRICE_USDC,
    slaMinutes: 10,
    requirementSchema: {
      title: "Build Spot Swap Plan Request",
      type: "object",
      properties: {
        walletAddress: { type: "string" },
        fromChainId: { type: "number" },
        toChainId: { type: "number" },
        fromTokenAddress: { type: "string" },
        toTokenAddress: { type: "string" },
        fromTokenSymbol: { type: "string" },
        toTokenSymbol: { type: "string" },
        amount: { type: "string" },
        amountUsd: { type: "number" },
        slippageBps: { type: "number" },
      },
      required: ["walletAddress", "fromChainId", "toChainId", "fromTokenAddress", "toTokenAddress", "amount"],
      additionalProperties: false,
    },
    deliverableSchema: {
      title: "Build Spot Swap Plan Response",
      type: "object",
      properties: {
        summary: { type: "string" },
        generatedAt: { type: "string", format: "date-time" },
        policyAllowed: { type: "boolean" },
        requiresApproval: { type: "boolean" },
        reasons: { type: "array", items: { type: "string" } },
        executionUrl: { type: "string" },
      },
      required: ["summary", "generatedAt", "policyAllowed", "requiresApproval", "reasons", "executionUrl"],
      additionalProperties: true,
    },
  },
  {
    key: "build_rebalance_plan",
    title: "Build Rebalance Plan",
    description: "Build a non-custodial rebalance plan across the existing YieldPilot Aave and LI.FI execution rails.",
    priceUsdc: env.ACP_BUILD_REBALANCE_PLAN_PRICE_USDC,
    slaMinutes: 10,
    requirementSchema: {
      title: "Build Rebalance Plan Request",
      type: "object",
      properties: {
        walletAddress: { type: "string" },
      },
      required: ["walletAddress"],
      additionalProperties: false,
    },
    deliverableSchema: {
      title: "Build Rebalance Plan Response",
      type: "object",
      properties: {
        summary: { type: "string" },
        generatedAt: { type: "string", format: "date-time" },
        policyAllowed: { type: "boolean" },
        requiresApproval: { type: "boolean" },
        reasons: { type: "array", items: { type: "string" } },
        executionUrl: { type: "string" },
      },
      required: ["summary", "generatedAt", "policyAllowed", "requiresApproval", "reasons", "executionUrl"],
      additionalProperties: true,
    },
  },
];

export function buildVirtualsManifest(baseUrl = env.ACP_BASE_URL): VirtualsAgentDefinition[] {
  return [
    {
      key: "yieldpilot-research",
      name: "YieldPilot Research",
      businessDescription:
        "Crypto research agent focused on token launches, watchlist-based whale activity, and structured trade signals. Outputs deterministic JSON backed by DexScreener, CoinGecko, DefiLlama, RSS feeds, and YieldPilot analysis.",
      offerings: researchOfferings,
      resources: researchResources.map((resource) => ({
        ...resource,
        path: `${baseUrl}${resource.path}`,
      })),
    },
    {
      key: "yieldpilot-trade-planner",
      name: "YieldPilot Trade Planner",
      businessDescription:
        "Non-custodial trade planning agent for spot swaps, bridge swaps, and YieldPilot rebalance plans. Uses LI.FI routing and YieldPilot policy checks, but never directly takes custody of funds or executes trades from ACP jobs.",
      offerings: tradePlannerOfferings,
      resources: [
        {
          key: "supported_chains",
          title: "Supported Chains",
          description: "Base, Arbitrum, and Optimism support for non-custodial trade planning.",
          path: `${baseUrl}/api/virtuals/resources/supported_chains?agent=yieldpilot-trade-planner`,
        },
        {
          key: "methodology",
          title: "Methodology",
          description: "YieldPilot planning methodology, risk boundaries, and execution handoff model.",
          path: `${baseUrl}/api/virtuals/resources/methodology?agent=yieldpilot-trade-planner`,
        },
      ],
    },
  ];
}

export function getVirtualsAgentDefinition(agentKey: VirtualsAgentKey, baseUrl = env.ACP_BASE_URL) {
  return buildVirtualsManifest(baseUrl).find((agent) => agent.key === agentKey);
}
