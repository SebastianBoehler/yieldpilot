import { ActionStatus, RunStatus, SponsorshipStatus, StrategyMode } from "@prisma/client";
import { toRiskPolicy } from "@/agent/policy";
import { runYieldStrategyModule } from "@/agent/strategies/yield-agent";
import type { AgentActionRequest, AgentCycleActionResult, AgentCycleRuntimeResult, AgentCycleTraceEvent, StrategyModuleResult } from "@/agent/types";
import { executeActionBundle } from "@/execution/facade";
import { getProtocolAdapter } from "@/protocols/adapter-registry";
import { evaluateAgentActionRisk } from "@/risk/agent-risk-engine";
import {
  appendDecisionTrace,
  createActionExecutionRecord,
  createActionRequestRecord,
  createAgentCycleRecord,
  createProtocolLog,
  finalizeAgentCycleRecord,
  getCircuitBreakerState,
  getDailyActionStats,
  getOpenPositionCount,
  snapshotAdapterCapabilities,
  updateActionRequestRecord,
  updateCircuitBreaker,
} from "@/storage/agent-store";
import type { StrategyPolicy } from "@/types/domain";

type AgentCycleRunnerInput = {
  walletAddress: `0x${string}`;
  userId: string;
  strategyId: string;
  strategyMode: StrategyMode;
  policy: StrategyPolicy;
  agentRunId?: string;
};

type YieldCycleResult = AgentCycleRuntimeResult & {
  positions: Awaited<ReturnType<typeof runYieldStrategyModule>>["positions"];
  opportunities: Awaited<ReturnType<typeof runYieldStrategyModule>>["opportunities"];
  candidate?: Awaited<ReturnType<typeof runYieldStrategyModule>>["candidate"];
  strategyResult: StrategyModuleResult;
};

function toSponsorshipStatus(eligible: boolean, sponsored: boolean) {
  if (!eligible) {
    return SponsorshipStatus.UNSUPPORTED;
  }

  return sponsored ? SponsorshipStatus.SPONSORED : SponsorshipStatus.ELIGIBLE;
}

export async function runAutonomousAgentCycle(input: AgentCycleRunnerInput): Promise<YieldCycleResult> {
  const riskPolicy = toRiskPolicy(input.policy);
  const liveExecutionEnabled = input.strategyMode === StrategyMode.AUTONOMOUS && riskPolicy.liveExecutionEnabled;
  const cycle = await createAgentCycleRecord({
    walletAddress: input.walletAddress,
    userId: input.userId,
    strategyId: input.strategyId,
    strategyKey: riskPolicy.strategyKey,
    liveExecutionEnabled,
    maxReasoningSteps: riskPolicy.maxReasoningSteps,
    maxActionsPerCycle: riskPolicy.maxActionsPerCycle,
    timeoutMs: riskPolicy.cycleTimeoutMs,
    agentRunId: input.agentRunId,
  });

  const trace: AgentCycleTraceEvent[] = [];
  const startedAt = Date.now();
  const actionResults: AgentCycleActionResult[] = [];

  const traceEvent = async (step: string, message: string, payload?: Record<string, unknown>) => {
    if (trace.length >= riskPolicy.maxReasoningSteps) {
      throw new Error("maxReasoningSteps exceeded.");
    }

    trace.push({
      step,
      message,
      payload,
    });
    await appendDecisionTrace({
      cycleId: cycle.id,
      step,
      message,
      payload,
    });
  };

  try {
    await traceEvent("cycle.started", "Agent cycle started.", {
      strategyKey: riskPolicy.strategyKey,
      liveExecutionEnabled,
    });

    const strategy = await runYieldStrategyModule({
      walletAddress: input.walletAddress,
      policy: input.policy,
    });

    await traceEvent("strategy.completed", strategy.summary, {
      candidateCount: strategy.candidateCount,
    });

    if (!strategy.actions.length) {
      await finalizeAgentCycleRecord({
        cycleId: cycle.id,
        status: RunStatus.COMPLETED,
        summary: strategy.summary,
        outputs: {
          strategy,
        },
      });

      return {
        status: RunStatus.COMPLETED,
        summary: strategy.summary,
        strategyKey: strategy.strategyKey,
        liveExecutionEnabled,
        cycleId: cycle.id,
        actions: [],
        trace,
        positions: strategy.positions,
        opportunities: strategy.opportunities,
        candidate: strategy.candidate,
        strategyResult: strategy,
      };
    }

    const [dailyStats, openPositionCount, circuitBreaker] = await Promise.all([
      getDailyActionStats(input.strategyId),
      getOpenPositionCount(input.strategyId),
      getCircuitBreakerState(input.strategyId),
    ]);
    const plannedActions = strategy.actions.slice(0, riskPolicy.maxActionsPerCycle);

    for (const request of plannedActions) {
      if (Date.now() - startedAt > riskPolicy.cycleTimeoutMs) {
        throw new Error("Agent cycle timed out.");
      }

      await traceEvent("action.started", `Processing ${request.kind} via ${request.protocol}.`, {
        chainId: request.chainId,
        title: request.title,
      });

      const actionRecord = await createActionRequestRecord({
        userId: input.userId,
        strategyId: input.strategyId,
        cycleId: cycle.id,
        request,
      });
      const adapter = getProtocolAdapter(request.protocol);
      const capabilities = adapter.getCapabilities();
      const preferredWalletProvider = riskPolicy.enableSmartAccounts ? "erc4337" : "eoa";

      await snapshotAdapterCapabilities({
        strategyId: input.strategyId,
        chainId: request.chainId,
        actionKind: request.kind,
        walletProvider: preferredWalletProvider,
        capabilities,
      });

      const quote = await adapter.quoteAction(request, {
        walletAddress: input.walletAddress,
        executionMode: liveExecutionEnabled ? "live" : "dry-run",
      });
      await updateActionRequestRecord({
        actionRequestId: actionRecord.id,
        status: ActionStatus.QUOTED,
        quote: quote as unknown as Record<string, unknown>,
      });

      const validation = await adapter.validateAction(request, {
        walletAddress: input.walletAddress,
        executionMode: liveExecutionEnabled ? "live" : "dry-run",
      });
      const risk = evaluateAgentActionRisk({
        policy: riskPolicy,
        request: {
          ...request,
          amountUsd: quote.amountUsd ?? request.amountUsd,
        } satisfies AgentActionRequest,
        context: {
          dailyActionCount: dailyStats.count + actionResults.length,
          dailyNotionalUsd: dailyStats.notionalUsd + actionResults.reduce((sum, result) => sum + (result.request.amountUsd ?? 0), 0),
          openPositionCount,
          liveExecutionEnabled,
          circuitBreakerOpen: circuitBreaker.isOpen,
        },
      });

      const simulation = riskPolicy.requireSimulation
        ? await adapter.simulateAction(request, {
            walletAddress: input.walletAddress,
            executionMode: liveExecutionEnabled ? "live" : "dry-run",
          })
        : {
            simulated: false,
            success: true,
            warnings: [],
            metadata: {},
          };

      const blockedReasons = [
        ...validation.reasons,
        ...risk.reasons,
        ...(simulation.success ? [] : simulation.warnings),
      ];

      await updateActionRequestRecord({
        actionRequestId: actionRecord.id,
        status: blockedReasons.length ? ActionStatus.BLOCKED : ActionStatus.SIMULATED,
        validation: validation as unknown as Record<string, unknown>,
        simulation: simulation as unknown as Record<string, unknown>,
      });

      await createProtocolLog({
        strategyId: input.strategyId,
        cycleId: cycle.id,
        actionRequestId: actionRecord.id,
        protocol: request.protocol,
        event: blockedReasons.length ? "action.blocked" : "action.ready",
        level: blockedReasons.length ? "warn" : "info",
        payload: {
          validation,
          risk,
          simulation,
        },
      });

      if (blockedReasons.length || input.strategyMode === StrategyMode.HUMAN_APPROVAL || !liveExecutionEnabled) {
        const bundle = await adapter.executeAction(request, {
          walletAddress: input.walletAddress,
          executionMode: "dry-run",
        });
        const sponsorshipStatus = toSponsorshipStatus(bundle.sponsorship.eligible, bundle.sponsorship.sponsored);

        await updateActionRequestRecord({
          actionRequestId: actionRecord.id,
          status: blockedReasons.length ? ActionStatus.BLOCKED : ActionStatus.SIMULATED,
          sponsorshipStatus,
          result: {
            bundle,
            blockedReasons,
            queuedForApproval: input.strategyMode === StrategyMode.HUMAN_APPROVAL,
          },
        });

        await createActionExecutionRecord({
          actionRequestId: actionRecord.id,
          status: blockedReasons.length ? ActionStatus.BLOCKED : ActionStatus.SIMULATED,
          walletProvider: riskPolicy.enableSmartAccounts ? "erc4337" : "eoa",
          gasSponsored: bundle.sponsorship.sponsored,
          sponsorshipStatus,
          sponsorMetadata: bundle.sponsorship.metadata,
          executionPayload: bundle as unknown as Record<string, unknown>,
          result: {
            blockedReasons,
            txSteps: bundle.txSteps,
          },
        });

        actionResults.push({
          request,
          quote,
          validation,
          simulation,
          plannedBundle: bundle,
          blockedReasons,
        });
        continue;
      }

      const bundle = await adapter.executeAction(request, {
        walletAddress: input.walletAddress,
        executionMode: "live",
      });
      const executed = await executeActionBundle({
        request,
        bundle: {
          routeTool: bundle.routeTool,
          txSteps: bundle.txSteps,
          metadata: bundle.metadata,
        },
        policy: riskPolicy,
      });

      const sponsored = executed.execution.sponsorship.sponsored;
      const sponsorshipStatus = toSponsorshipStatus(
        executed.execution.sponsorship.eligible,
        sponsored,
      );
      const finalStatus =
        executed.execution.status === "CONFIRMED"
          ? ActionStatus.EXECUTED
          : executed.execution.status === "UNSUPPORTED"
            ? ActionStatus.UNSUPPORTED
            : ActionStatus.FAILED;

      await updateActionRequestRecord({
        actionRequestId: actionRecord.id,
        status: finalStatus,
        sponsorshipStatus,
        result: executed.execution.metadata as Record<string, unknown>,
      });
      await createActionExecutionRecord({
        actionRequestId: actionRecord.id,
        status: finalStatus,
        walletProvider: executed.providerMode,
        gasSponsored: sponsored,
        sponsorshipStatus,
        transactionHash: executed.execution.transactionHash,
        explorerUrl: executed.execution.explorerUrl,
        sponsorMetadata: executed.execution.sponsorship.metadata,
        executionPayload: bundle as unknown as Record<string, unknown>,
        result: executed.execution.metadata as Record<string, unknown>,
      });

      await updateCircuitBreaker({
        strategyId: input.strategyId,
        threshold: riskPolicy.circuitBreakerThreshold,
        windowMinutes: riskPolicy.circuitBreakerWindowMinutes,
        success: finalStatus === ActionStatus.EXECUTED,
        reason: executed.execution.error,
      });

      actionResults.push({
        request,
        quote,
        validation,
        simulation,
        plannedBundle: bundle,
        execution: executed.execution,
        blockedReasons: finalStatus === ActionStatus.EXECUTED ? undefined : [executed.execution.error ?? "Execution failed."],
      });
    }

    const failures = actionResults.filter((result) => result.execution?.status && result.execution.status !== "CONFIRMED").length;
    const summary = failures
      ? `Cycle completed with ${failures} failed or blocked actions out of ${actionResults.length}.`
      : input.strategyMode === StrategyMode.HUMAN_APPROVAL
        ? `Cycle prepared ${actionResults.length} actions for approval.`
        : `Cycle executed ${actionResults.length} actions successfully.`;

    await traceEvent("cycle.finalized", summary, {
      actionCount: actionResults.length,
      failures,
    });

    await finalizeAgentCycleRecord({
      cycleId: cycle.id,
      status: RunStatus.COMPLETED,
      summary,
      outputs: {
        strategy,
        actions: actionResults,
      },
    });

    return {
      status: RunStatus.COMPLETED,
      summary,
      strategyKey: strategy.strategyKey,
      liveExecutionEnabled,
      cycleId: cycle.id,
      actions: actionResults,
      trace,
      positions: strategy.positions,
      opportunities: strategy.opportunities,
      candidate: strategy.candidate,
      strategyResult: strategy,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendDecisionTrace({
      cycleId: cycle.id,
      step: "cycle.failed",
      message,
      payload: {},
    });
    await finalizeAgentCycleRecord({
      cycleId: cycle.id,
      status: RunStatus.FAILED,
      summary: "Cycle failed.",
      error: message,
      outputs: {
        trace,
      },
    });

    throw error;
  }
}
