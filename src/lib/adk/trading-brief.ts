import { InMemoryRunner, LlmAgent } from "@google/adk";
import { z } from "zod";
import { env, hasGoogleAdkCredentials } from "@/lib/config/env";
import type { MarketIntelligenceBrief } from "@/types/domain";

const marketBriefSchema = z.object({
  marketRegime: z.enum(["risk-on", "mixed", "risk-off"]),
  recommendedAction: z.enum(["deploy", "hold", "reduce"]),
  focusAssets: z.array(z.string()).max(5),
  focusIndexes: z.array(z.string()).max(4),
  summary: z.string(),
  riskNotes: z.array(z.string()).max(5),
});

type TradingBriefInput = {
  walletAddress: string;
  indexes: Array<{
    key: string;
    name: string;
    projectedApy: number;
    description: string;
  }>;
  marketPulse: Array<{
    symbol: string;
    change24h: number;
    priceUsd: number;
  }>;
  newsFeed: Array<{
    source: string;
    title: string;
    summary?: string;
  }>;
};

function buildFallbackBrief(input: TradingBriefInput): MarketIntelligenceBrief {
  const positiveMoves = input.marketPulse.filter((asset) => asset.change24h > 0).length;
  const negativeMoves = input.marketPulse.filter((asset) => asset.change24h < 0).length;
  const marketRegime =
    positiveMoves > negativeMoves ? "risk-on" : negativeMoves > positiveMoves ? "risk-off" : "mixed";
  const recommendedAction =
    marketRegime === "risk-on" ? "deploy" : marketRegime === "risk-off" ? "reduce" : "hold";
  const focusAssets = input.marketPulse
    .slice()
    .sort((left, right) => right.change24h - left.change24h)
    .slice(0, 3)
    .map((asset) => asset.symbol);
  const focusIndexes = input.indexes
    .slice()
    .sort((left, right) => right.projectedApy - left.projectedApy)
    .slice(0, 3)
    .map((index) => index.key);

  return {
    generatedAt: new Date().toISOString(),
    marketRegime,
    recommendedAction,
    focusAssets,
    focusIndexes,
    summary:
      recommendedAction === "deploy"
        ? "Market tape is constructive enough to keep deploying capital into the strongest supported sleeves."
        : recommendedAction === "reduce"
          ? "External tape is defensive; keep tighter risk and avoid forcing new exposure unless the deterministic route is exceptional."
          : "Signals are mixed; maintain current posture and require stronger edge before reallocating.",
    riskNotes: [
      "Use external market context as a throttle, not as the source of truth for execution safety.",
      "Keep final execution gated by policy, simulation, approvals, and supported wallet paths.",
    ],
  };
}

function createTradingBriefAgent() {
  return new LlmAgent({
    name: "yieldpilot_market_brief",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Summarizes external market context into a compact wallet-management brief.",
    includeContents: "none",
    instruction: (context) =>
      [
        "You are the YieldPilot market brief agent.",
        "Use only the provided JSON state.",
        "Produce a compact portfolio-management brief for the next 30-minute loop.",
        "Do not invent unsupported venues or assets.",
        "Return JSON only.",
        "",
        `External market context:\n${JSON.stringify(context.state.get("external_context") ?? null, null, 2)}`,
      ].join("\n"),
    outputSchema: marketBriefSchema,
    outputKey: "market_brief",
  });
}

export async function runTradingBrief(input: TradingBriefInput): Promise<MarketIntelligenceBrief> {
  if (!hasGoogleAdkCredentials) {
    return buildFallbackBrief(input);
  }

  const runner = new InMemoryRunner({
    appName: "YieldPilotTradingBrief",
    agent: createTradingBriefAgent(),
  });

  const session = await runner.sessionService.createSession({
    appName: "YieldPilotTradingBrief",
    userId: input.walletAddress,
    state: {
      external_context: input,
    },
  });

  for await (const event of runner.runAsync({
    userId: input.walletAddress,
    sessionId: session.id,
    newMessage: {
      role: "user",
      parts: [{ text: "Prepare the next 30-minute trading and wallet-management brief." }],
    },
  })) {
    void event;
  }

  const completedSession = await runner.sessionService.getSession({
    appName: "YieldPilotTradingBrief",
    userId: input.walletAddress,
    sessionId: session.id,
  });

  const parsed = marketBriefSchema.parse(completedSession?.state?.market_brief);

  return {
    generatedAt: new Date().toISOString(),
    ...parsed,
  };
}
