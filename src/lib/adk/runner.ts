import { FunctionTool, InMemoryRunner, LlmAgent, SequentialAgent } from "@google/adk";
import { z } from "zod";
import { env, hasGoogleAdkCredentials } from "@/lib/config/env";
import type { ExecutionPlan, PolicyResult, RebalanceCandidate } from "@/types/domain";

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

function createRootAgent() {
  const strategyContextTool = new FunctionTool({
    name: "load_strategy_context",
    description: "Load the current portfolio, opportunity universe, and top-ranked candidate.",
    execute: (_input, toolContext) => toolContext?.state.get("strategy_context"),
  });

  const riskContextTool = new FunctionTool({
    name: "load_risk_context",
    description: "Load the policy evaluation context and the strategy output.",
    execute: (_input, toolContext) => ({
      policyContext: toolContext?.state.get("risk_context"),
      strategyOutput: toolContext?.state.get("strategy_output"),
    }),
  });

  const executionContextTool = new FunctionTool({
    name: "load_execution_context",
    description: "Load the execution plan, policy result, and strategy output.",
    execute: (_input, toolContext) => ({
      executionContext: toolContext?.state.get("execution_context"),
      strategyOutput: toolContext?.state.get("strategy_output"),
      riskOutput: toolContext?.state.get("risk_output"),
    }),
  });

  const portfolioContextTool = new FunctionTool({
    name: "load_portfolio_context",
    description: "Load the final execution state and current portfolio telemetry.",
    execute: (_input, toolContext) => ({
      portfolioContext: toolContext?.state.get("portfolio_context"),
      strategyOutput: toolContext?.state.get("strategy_output"),
      riskOutput: toolContext?.state.get("risk_output"),
      executionOutput: toolContext?.state.get("execution_output"),
    }),
  });

  const strategyAgent = new LlmAgent({
    name: "strategy_agent",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Evaluates yield opportunities and decides whether a rebalance is worth proposing.",
    instruction:
      "Call load_strategy_context exactly once. Use the live context to decide whether YieldPilot should rebalance or hold. Return JSON only.",
    tools: [strategyContextTool],
    outputSchema: strategyOutputSchema,
    outputKey: "strategy_output",
  });

  const riskAgent = new LlmAgent({
    name: "risk_agent",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Checks whether the proposed rebalance fits the policy and approval mode.",
    instruction:
      "Call load_risk_context exactly once. Validate the proposal against the provided policy result. Return JSON only.",
    tools: [riskContextTool],
    outputSchema: riskOutputSchema,
    outputKey: "risk_output",
  });

  const executionAgent = new LlmAgent({
    name: "execution_agent",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Determines whether the plan should be queued for approval, executed, or blocked.",
    instruction:
      "Call load_execution_context exactly once. Use the supplied execution plan and approval mode to produce the execution decision. Return JSON only.",
    tools: [executionContextTool],
    outputSchema: executionOutputSchema,
    outputKey: "execution_output",
  });

  const portfolioAgent = new LlmAgent({
    name: "portfolio_agent",
    model: env.GOOGLE_GENAI_MODEL,
    description: "Summarizes the loop outcome and the monitoring focus after the decision.",
    instruction:
      "Call load_portfolio_context exactly once. Summarize the loop outcome and the next monitoring focus. Return JSON only.",
    tools: [portfolioContextTool],
    outputSchema: portfolioOutputSchema,
    outputKey: "portfolio_output",
  });

  return new SequentialAgent({
    name: "yieldpilot_root",
    subAgents: [strategyAgent, riskAgent, executionAgent, portfolioAgent],
  });
}

export async function runAdkReview(input: AdkReviewInput): Promise<AdkReviewOutput> {
  if (!hasGoogleAdkCredentials) {
    return buildFallbackReview(input);
  }

  const runner = new InMemoryRunner({
    appName: "YieldPilot",
    agent: createRootAgent(),
  });

  const session = await runner.sessionService.createSession({
    appName: "YieldPilot",
    userId: input.walletAddress,
    state: {
      strategy_context: {
        walletAddress: input.walletAddress,
        positions: input.positions,
        opportunities: input.opportunities.slice(0, 8),
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
      portfolio_context: {
        totalPositions: input.positions.length,
        totalOpportunities: input.opportunities.length,
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
    // Drain the event stream so ADK persists state outputs for each sub-agent.
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
