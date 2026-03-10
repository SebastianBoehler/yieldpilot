import { InMemoryRunner, LlmAgent, ParallelAgent, SequentialAgent } from "@google/adk";
import type { ReadonlyContext } from "@google/adk";
import { z } from "zod";
import { env, hasGoogleAdkCredentials } from "@/lib/config/env";
import type { ExecutionPlan, PolicyResult, RebalanceCandidate } from "@/types/domain";

const portfolioAnalysisSchema = z.object({
  summary: z.string(),
  sourceOfTruth: z.string(),
  concentrationRisk: z.enum(["low", "medium", "high"]),
  monitoringFocus: z.string(),
});

const marketAnalysisSchema = z.object({
  summary: z.string(),
  bestMarketLabel: z.string(),
  routeAssessment: z.string(),
  confidence: z.number().min(0).max(1),
});

const strategyOutputSchema = z.object({
  action: z.enum(["rebalance", "hold"]),
  summary: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});

const riskOutputSchema = z.object({
  allowed: z.boolean(),
  requiresHumanApproval: z.boolean(),
  summary: z.string(),
  reasons: z.array(z.string()),
});

const executionOutputSchema = z.object({
  mode: z.enum(["queue_approval", "execute", "blocked"]),
  summary: z.string(),
  txCount: z.number().int().nonnegative(),
  rationale: z.string(),
});

const portfolioOutputSchema = z.object({
  message: z.string(),
  monitoringFocus: z.string(),
  nextStep: z.string(),
});

type AdkReviewInput = {
  walletAddress: string;
  candidate?: RebalanceCandidate;
  policyResult?: PolicyResult;
  executionPlan?: ExecutionPlan;
  positions: Array<Record<string, unknown>>;
  opportunities: Array<Record<string, unknown>>;
};

type AdkReviewOutput = {
  strategyOutput: z.infer<typeof strategyOutputSchema>;
  riskOutput: z.infer<typeof riskOutputSchema>;
  executionOutput: z.infer<typeof executionOutputSchema>;
  portfolioOutput: z.infer<typeof portfolioOutputSchema>;
};

function stringifyState(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function stateInstruction(
  intro: string,
  sections: Array<{
    title: string;
    key: string;
  }>,
) {
  return (context: ReadonlyContext) => {
    const renderedSections = sections
      .map(({ title, key }) => `${title}:\n${stringifyState(context.state.get(key))}`)
      .join("\n\n");

    return `${intro}\n\n${renderedSections}`;
  };
}

function buildFallbackReview(input: AdkReviewInput): AdkReviewOutput {
  const strategyOutput = input.candidate
    ? {
        action: "rebalance" as const,
        summary: `Propose a rebalance into ${input.candidate.destinationOpportunity.chainLabel} ${input.candidate.destinationOpportunity.assetSymbol}.`,
        reason: input.candidate.rationale,
        confidence: 0.83,
      }
    : {
        action: "hold" as const,
        summary: "No rebalance is justified.",
        reason: "The live opportunity set does not clear the configured net-benefit threshold.",
        confidence: 0.91,
      };

  const riskOutput = input.policyResult
    ? {
        allowed: input.policyResult.allowed,
        requiresHumanApproval: input.policyResult.requiresHumanApproval,
        summary: input.policyResult.allowed
          ? input.policyResult.requiresHumanApproval
            ? "The plan is allowed but must enter the approval queue."
            : "The plan is fully policy compliant."
          : "The plan is blocked by policy.",
        reasons: input.policyResult.reasons,
      }
    : {
        allowed: false,
        requiresHumanApproval: false,
        summary: "No candidate available for policy validation.",
        reasons: ["No action plan was generated."],
      };

  const executionOutput = {
    mode: !input.executionPlan
      ? ("blocked" as const)
      : input.policyResult?.requiresHumanApproval
        ? ("queue_approval" as const)
        : ("execute" as const),
    summary: !input.executionPlan
      ? "Execution is blocked because there is no executable plan."
      : `Prepared ${input.executionPlan.txSteps.length} transactions for the rebalance.`,
    txCount: input.executionPlan?.txSteps.length ?? 0,
    rationale: input.executionPlan?.rationale ?? "No execution rationale available.",
  };

  const portfolioOutput = {
    message: input.executionPlan
      ? `Portfolio monitoring should focus on ${input.executionPlan.destinationProtocol} on ${input.executionPlan.destinationChainId}.`
      : "Portfolio remains in the current allocation until a stronger opportunity appears.",
    monitoringFocus: input.executionPlan?.destinationProtocol ?? "Current live positions",
    nextStep: input.executionPlan
      ? "Watch bridge settlement and destination deposit confirmation."
      : "Wait for the next scheduled agent loop.",
  };

  return {
    strategyOutput,
    riskOutput,
    executionOutput,
    portfolioOutput,
  };
}

export function createYieldPilotWorkflowAgent() {
  const portfolioAnalyst = new LlmAgent({
    name: "portfolio_analyst",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Analyzes current allocations, concentration risk, and what part of the portfolio matters most for the next move.",
    includeContents: "none",
    instruction: stateInstruction(
      "You are the YieldPilot portfolio analysis skill. Use only the provided JSON state. Explain the current allocation, concentration risk, and what should be monitored if the agent acts. Return JSON only.",
      [
        { title: "Portfolio context", key: "portfolio_context" },
        { title: "Review context", key: "review_context" },
      ],
    ),
    outputSchema: portfolioAnalysisSchema,
    outputKey: "portfolio_analysis",
  });

  const marketAnalyst = new LlmAgent({
    name: "market_analyst",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Analyzes the current yield universe, destination attractiveness, and route economics.",
    includeContents: "none",
    instruction: stateInstruction(
      "You are the YieldPilot market analysis skill. Use only the supplied JSON state. Summarize the best available market, comment on route economics, and assign confidence to the attractiveness of the candidate. Return JSON only.",
      [
        { title: "Market context", key: "market_context" },
        { title: "Review context", key: "review_context" },
      ],
    ),
    outputSchema: marketAnalysisSchema,
    outputKey: "market_analysis",
  });

  const strategyAgent = new LlmAgent({
    name: "strategy_agent",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Turns the parallel analyses into a treasury action recommendation.",
    includeContents: "none",
    instruction: stateInstruction(
      "You are the YieldPilot strategy agent. Use the portfolio and market analyses plus the candidate context to decide whether the agent should rebalance or hold. If no candidate exists, action must be hold. Return JSON only.",
      [
        { title: "Review context", key: "review_context" },
        { title: "Portfolio analysis", key: "portfolio_analysis" },
        { title: "Market analysis", key: "market_analysis" },
      ],
    ),
    outputSchema: strategyOutputSchema,
    outputKey: "strategy_output",
  });

  const riskAgent = new LlmAgent({
    name: "risk_agent",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Validates the proposed action against policy and approval mode.",
    includeContents: "none",
    instruction: stateInstruction(
      "You are the YieldPilot risk and policy agent. Use the structured policy result as the source of truth, then explain whether the recommendation is allowed and whether human approval is required. Return JSON only.",
      [
        { title: "Risk context", key: "risk_context" },
        { title: "Strategy output", key: "strategy_output" },
      ],
    ),
    outputSchema: riskOutputSchema,
    outputKey: "risk_output",
  });

  const executionAgent = new LlmAgent({
    name: "execution_agent",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Determines whether the plan should be queued, executed, or blocked.",
    includeContents: "none",
    instruction: stateInstruction(
      "You are the YieldPilot execution agent. Use the execution context, the strategy output, and the risk output. If there is no execution plan, mode must be blocked. If human approval is required, mode must be queue_approval. Otherwise mode must be execute. Return JSON only.",
      [
        { title: "Execution context", key: "execution_context" },
        { title: "Strategy output", key: "strategy_output" },
        { title: "Risk output", key: "risk_output" },
      ],
    ),
    outputSchema: executionOutputSchema,
    outputKey: "execution_output",
  });

  const portfolioAgent = new LlmAgent({
    name: "portfolio_agent",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Produces the post-decision monitoring summary for the treasury loop.",
    includeContents: "none",
    instruction: stateInstruction(
      "You are the YieldPilot portfolio agent. Summarize the outcome of the loop, state what should be monitored next, and explain the next operational step. Return JSON only.",
      [
        { title: "Portfolio context", key: "portfolio_context" },
        { title: "Portfolio analysis", key: "portfolio_analysis" },
        { title: "Market analysis", key: "market_analysis" },
        { title: "Strategy output", key: "strategy_output" },
        { title: "Risk output", key: "risk_output" },
        { title: "Execution output", key: "execution_output" },
      ],
    ),
    outputSchema: portfolioOutputSchema,
    outputKey: "portfolio_output",
  });

  const analysisWorkflow = new ParallelAgent({
    name: "analysis_workflow",
    description: "Runs portfolio and market analysis in parallel on the shared session state.",
    subAgents: [portfolioAnalyst, marketAnalyst],
  });

  const decisionWorkflow = new SequentialAgent({
    name: "decision_workflow",
    description: "Executes the documented strategy, risk, execution, and monitoring handoff in order.",
    subAgents: [strategyAgent, riskAgent, executionAgent, portfolioAgent],
  });

  return new SequentialAgent({
    name: "yieldpilot_root",
    description: "YieldPilot ADK workflow composed of parallel analysis followed by sequential decision agents.",
    subAgents: [analysisWorkflow, decisionWorkflow],
  });
}

export async function runAdkReview(input: AdkReviewInput): Promise<AdkReviewOutput> {
  if (!hasGoogleAdkCredentials) {
    return buildFallbackReview(input);
  }

  const runner = new InMemoryRunner({
    appName: "YieldPilot",
    agent: createYieldPilotWorkflowAgent(),
  });

  const session = await runner.sessionService.createSession({
    appName: "YieldPilot",
    userId: input.walletAddress,
    state: {
      review_context: {
        walletAddress: input.walletAddress,
        candidate: input.candidate
          ? {
              amountUsd: input.candidate.amountUsd,
              expectedApyDelta: input.candidate.expectedApyDelta,
              expectedNetBenefitUsd: input.candidate.expectedNetBenefitUsd,
              routeCostUsd: input.candidate.routeCost.totalCostUsd,
              source: {
                chainLabel: input.candidate.sourcePosition.chainLabel,
                protocolLabel: input.candidate.sourcePosition.protocolLabel,
                assetSymbol: input.candidate.sourcePosition.assetSymbol,
              },
              destination: {
                chainLabel: input.candidate.destinationOpportunity.chainLabel,
                protocolLabel: input.candidate.destinationOpportunity.protocolLabel,
                assetSymbol: input.candidate.destinationOpportunity.assetSymbol,
                apy: input.candidate.destinationOpportunity.apy,
              },
              rationale: input.candidate.rationale,
            }
          : null,
      },
      portfolio_context: {
        walletAddress: input.walletAddress,
        totalPositions: input.positions.length,
        positions: input.positions.slice(0, 8),
      },
      market_context: {
        totalOpportunities: input.opportunities.length,
        opportunities: input.opportunities.slice(0, 8),
      },
      risk_context: {
        policyResult: input.policyResult,
      },
      execution_context: {
        executionPlan: input.executionPlan
          ? {
              routeId: input.executionPlan.routeId,
              txCount: input.executionPlan.txSteps.length,
              mode: input.policyResult?.requiresHumanApproval ? "human_approval" : "autonomous",
              txSteps: input.executionPlan.txSteps.map((step) => ({
                title: step.title,
                type: step.transactionType,
                chainId: step.chainId,
              })),
              rationale: input.executionPlan.rationale,
            }
          : null,
      },
    },
  });

  for await (const event of runner.runAsync({
    userId: input.walletAddress,
    sessionId: session.id,
    newMessage: {
      role: "user",
      parts: [{ text: "Run a single YieldPilot treasury management review cycle." }],
    },
  })) {
    void event;
    // Drain the workflow events so ADK persists sub-agent outputs into session state.
  }

  const completedSession = await runner.sessionService.getSession({
    appName: "YieldPilot",
    userId: input.walletAddress,
    sessionId: session.id,
  });

  const state = completedSession?.state ?? {};

  return {
    strategyOutput: strategyOutputSchema.parse(state.strategy_output),
    riskOutput: riskOutputSchema.parse(state.risk_output),
    executionOutput: executionOutputSchema.parse(state.execution_output),
    portfolioOutput: portfolioOutputSchema.parse(state.portfolio_output),
  };
}
