import { InMemoryRunner, LlmAgent } from "@google/adk";
import { z } from "zod";
import { env, hasGoogleAdkCredentials } from "@/lib/config/env";
import type { ResearchSignalInput, ResearchSignalOutput } from "@/types/virtuals";

const researchSignalSchema = z.object({
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  signal: z.enum(["bullish", "bearish", "neutral", "watch"]),
  supporting_facts: z.array(z.string()).min(1).max(8),
  risks: z.array(z.string()).min(1).max(6),
  time_horizon: z.enum(["intraday", "1-7d", "1-4w"]),
});

type ResearchSynthesisInput = {
  input: ResearchSignalInput;
  facts: string[];
  risks: string[];
  context: Record<string, unknown>;
};

function buildFallbackOutput(input: ResearchSynthesisInput): ResearchSignalOutput {
  const factSummary = input.facts[0] ?? "Structured market context remains mixed.";
  const riskSummary = input.risks[0] ?? "Execution should remain gated by policy and explicit approval.";
  const signal =
    input.facts.some((fact) => /up|inflow|rising|strong|positive|bull/i.test(fact))
      ? "bullish"
      : input.facts.some((fact) => /down|outflow|weak|sell|bear/i.test(fact))
        ? "bearish"
        : "watch";

  return {
    summary: `${factSummary} ${riskSummary}`,
    confidence: input.facts.length >= 3 ? 0.74 : 0.61,
    signal,
    supporting_facts: input.facts.slice(0, 5),
    risks: input.risks.slice(0, 4),
    time_horizon: input.input.offeringKey === "generate_trade_signal" ? "1-7d" : "intraday",
    generated_at: new Date().toISOString(),
  };
}

function createResearchSignalAgent() {
  return new LlmAgent({
    name: "yieldpilot_virtuals_research",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Summarizes structured crypto research facts into a strict JSON payload for Virtuals ACP jobs.",
    includeContents: "none",
    instruction: (context) =>
      [
        "You are YieldPilot's Virtuals research synthesis agent.",
        "Use only the structured JSON input.",
        "Do not invent facts, chains, routing paths, wallets, or unsupported venues.",
        "Favor conservative confidence unless the evidence is strong.",
        "Return JSON only.",
        "",
        JSON.stringify(context.state.get("research_context") ?? null, null, 2),
      ].join("\n"),
    outputSchema: researchSignalSchema,
    outputKey: "research_signal",
  });
}

export async function runVirtualsResearchSynthesis(input: ResearchSynthesisInput): Promise<ResearchSignalOutput> {
  if (!hasGoogleAdkCredentials) {
    return buildFallbackOutput(input);
  }

  const runner = new InMemoryRunner({
    appName: "YieldPilotVirtualsResearch",
    agent: createResearchSignalAgent(),
  });

  const session = await runner.sessionService.createSession({
    appName: "YieldPilotVirtualsResearch",
    userId: input.input.walletAddress ?? input.input.query ?? input.input.offeringKey,
    state: {
      research_context: input,
    },
  });

  for await (const event of runner.runAsync({
    userId: input.input.walletAddress ?? input.input.query ?? input.input.offeringKey,
    sessionId: session.id,
    newMessage: {
      role: "user",
      parts: [{ text: "Generate the Virtuals research response." }],
    },
  })) {
    void event;
  }

  const completedSession = await runner.sessionService.getSession({
    appName: "YieldPilotVirtualsResearch",
    userId: input.input.walletAddress ?? input.input.query ?? input.input.offeringKey,
    sessionId: session.id,
  });

  const parsed = researchSignalSchema.parse(completedSession?.state?.research_signal);
  return {
    ...parsed,
    generated_at: new Date().toISOString(),
  };
}
