import { isLlmAgent, isParallelAgent, isSequentialAgent } from "@google/adk";
import { describe, expect, it } from "vitest";
import { createYieldPilotWorkflowAgent } from "@/lib/adk/runner";

describe("YieldPilot ADK workflow", () => {
  it("uses a parallel analysis stage followed by a sequential decision stage", () => {
    const rootAgent = createYieldPilotWorkflowAgent();

    expect(isSequentialAgent(rootAgent)).toBe(true);
    expect(rootAgent.subAgents.map((agent) => agent.name)).toEqual(["analysis_workflow", "decision_workflow"]);

    const analysisWorkflow = rootAgent.subAgents[0];
    const decisionWorkflow = rootAgent.subAgents[1];

    expect(isParallelAgent(analysisWorkflow)).toBe(true);
    expect(analysisWorkflow.subAgents.map((agent) => agent.name)).toEqual(["portfolio_analyst", "market_analyst"]);

    expect(isSequentialAgent(decisionWorkflow)).toBe(true);
    expect(decisionWorkflow.subAgents.map((agent) => agent.name)).toEqual([
      "strategy_agent",
      "risk_agent",
      "execution_agent",
      "portfolio_agent",
    ]);
  });

  it("stores each specialist output back into ADK session state", () => {
    const rootAgent = createYieldPilotWorkflowAgent();
    const analysisWorkflow = rootAgent.subAgents[0];
    const decisionWorkflow = rootAgent.subAgents[1];
    const specialists = [...analysisWorkflow.subAgents, ...decisionWorkflow.subAgents];

    expect(specialists.every((agent) => isLlmAgent(agent) && Boolean(agent.outputKey))).toBe(true);
    expect(specialists.every((agent) => isLlmAgent(agent) && agent.includeContents === "none")).toBe(true);
  });
});
