import { z } from "zod";
import type { ResearchSignalInput, TradePlanRequest, VirtualsOfferingKey } from "@/types/virtuals";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const analyzeTokenLaunchSchema = z.object({
  query: z.string().min(1),
  chainKey: z.enum(["base", "arbitrum", "optimism"]).optional(),
});

const detectWhaleMovementsSchema = z.object({
  trackedWallets: z.array(addressSchema).optional(),
  maxItems: z.coerce.number().int().positive().max(25).optional(),
});

const generateTradeSignalSchema = z.object({
  query: z.string().optional(),
  walletAddress: addressSchema.optional(),
});

const buildSpotSwapPlanSchema = z.object({
  walletAddress: addressSchema,
  fromChainId: z.coerce.number().int().positive(),
  toChainId: z.coerce.number().int().positive(),
  fromTokenAddress: addressSchema,
  toTokenAddress: addressSchema,
  fromTokenSymbol: z.string().optional(),
  toTokenSymbol: z.string().optional(),
  amount: z.string().min(1),
  amountUsd: z.coerce.number().positive().optional(),
  slippageBps: z.coerce.number().int().positive().max(500).optional(),
});

const buildRebalancePlanSchema = z.object({
  walletAddress: addressSchema,
});

export function parseResearchSignalInput(offeringKey: ResearchSignalInput["offeringKey"], payload: unknown): ResearchSignalInput {
  if (offeringKey === "analyze_token_launch") {
    return {
      offeringKey,
      ...analyzeTokenLaunchSchema.parse(payload ?? {}),
    };
  }

  if (offeringKey === "detect_whale_movements") {
    return {
      offeringKey,
      ...detectWhaleMovementsSchema.parse(payload ?? {}),
    };
  }

  const parsed = generateTradeSignalSchema.parse(payload ?? {});
  return {
    offeringKey,
    query: parsed.query,
    walletAddress: parsed.walletAddress as `0x${string}` | undefined,
  };
}

export function parseTradePlanInput(offeringKey: TradePlanRequest["offeringKey"], payload: unknown): TradePlanRequest {
  if (offeringKey === "build_spot_swap_plan") {
    const parsed = buildSpotSwapPlanSchema.parse(payload ?? {});
    return {
      offeringKey,
      ...parsed,
      walletAddress: parsed.walletAddress as `0x${string}`,
      fromTokenAddress: parsed.fromTokenAddress as `0x${string}`,
      toTokenAddress: parsed.toTokenAddress as `0x${string}`,
    };
  }

  const parsed = buildRebalancePlanSchema.parse(payload ?? {});
  return {
    offeringKey,
    walletAddress: parsed.walletAddress as `0x${string}`,
  };
}

export function resolveOfferingKey(jobName: string | undefined, payload: unknown): VirtualsOfferingKey | undefined {
  if (jobName && ["analyze_token_launch", "detect_whale_movements", "generate_trade_signal", "build_spot_swap_plan", "build_rebalance_plan"].includes(jobName)) {
    return jobName as VirtualsOfferingKey;
  }

  if (payload && typeof payload === "object" && "offeringKey" in payload) {
    const value = (payload as { offeringKey?: unknown }).offeringKey;
    if (typeof value === "string" && ["analyze_token_launch", "detect_whale_movements", "generate_trade_signal", "build_spot_swap_plan", "build_rebalance_plan"].includes(value)) {
      return value as VirtualsOfferingKey;
    }
  }

  return undefined;
}
