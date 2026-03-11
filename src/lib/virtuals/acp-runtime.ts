import AcpClient, { AcpContractClientV2, AcpJobPhases, baseAcpConfigV2, baseSepoliaAcpConfigV2, type AcpJob } from "@virtuals-protocol/acp-node";
import { env, hasVirtualsAcpRuntimeConfig } from "@/lib/config/env";
import { resolveOfferingKey, parseResearchSignalInput, parseTradePlanInput } from "@/lib/virtuals/request-parsers";
import { executeResearchOffering } from "@/server/services/research-service";
import { executeTradePlannerOffering } from "@/server/services/trade-planner-service";
import { upsertAcpJobAudit } from "@/storage/virtuals-store";
import type { VirtualsAgentKey } from "@/types/virtuals";

type ProviderRuntimeConfig = {
  agentKey: VirtualsAgentKey;
  entityId: number;
  walletAddress: `0x${string}`;
};

function getAcpConfig() {
  return env.ACP_ENVIRONMENT === "production" ? baseAcpConfigV2 : baseSepoliaAcpConfigV2;
}

function getProviderRuntimeConfigs(): ProviderRuntimeConfig[] {
  if (!hasVirtualsAcpRuntimeConfig) {
    return [];
  }

  return [
    {
      agentKey: "yieldpilot-research",
      entityId: env.ACP_RESEARCH_AGENT_ENTITY_ID!,
      walletAddress: env.ACP_RESEARCH_AGENT_WALLET_ADDRESS! as `0x${string}`,
    },
    {
      agentKey: "yieldpilot-trade-planner",
      entityId: env.ACP_TRADE_PLANNER_AGENT_ENTITY_ID!,
      walletAddress: env.ACP_TRADE_PLANNER_AGENT_WALLET_ADDRESS! as `0x${string}`,
    },
  ];
}

function parseJobPayload(job: AcpJob): unknown {
  if (typeof job.requirement === "string") {
    try {
      return JSON.parse(job.requirement);
    } catch {
      return {
        query: job.requirement,
      };
    }
  }

  return job.requirement ?? {};
}

function offeringMatchesAgent(agentKey: VirtualsAgentKey, offeringKey: string) {
  if (agentKey === "yieldpilot-research") {
    return ["analyze_token_launch", "detect_whale_movements", "generate_trade_signal"].includes(offeringKey);
  }

  return ["build_spot_swap_plan", "build_rebalance_plan"].includes(offeringKey);
}

async function handleRequestPhase(agentKey: VirtualsAgentKey, job: AcpJob) {
  const payload = parseJobPayload(job);
  const offeringKey = resolveOfferingKey(job.name, payload);

  if (!offeringKey) {
    await upsertAcpJobAudit({
      agentKey,
      acpJobId: String(job.id),
      phase: String(job.phase),
      status: "rejected",
      buyerAddress: job.clientAddress,
      providerAddress: job.providerAddress,
      requestPayload: payload as Record<string, unknown>,
      error: "Unsupported or missing offering key.",
    });
    await job.reject("Unsupported offering. YieldPilot only accepts registered research and planning services.");
    return;
  }

  if (!offeringMatchesAgent(agentKey, offeringKey)) {
    await upsertAcpJobAudit({
      agentKey,
      acpJobId: String(job.id),
      offeringKey,
      phase: String(job.phase),
      status: "rejected",
      buyerAddress: job.clientAddress,
      providerAddress: job.providerAddress,
      requestPayload: payload as Record<string, unknown>,
      error: "Offering key does not belong to this provider agent.",
    });
    await job.reject("The requested offering does not belong to this YieldPilot provider agent.");
    return;
  }

  await upsertAcpJobAudit({
    agentKey,
    acpJobId: String(job.id),
    offeringKey,
    phase: String(job.phase),
    status: "accepted",
    buyerAddress: job.clientAddress,
    providerAddress: job.providerAddress,
    requestPayload: payload as Record<string, unknown>,
  });

  await job.accept("YieldPilot accepted the job and will deliver a structured JSON response after the ACP payment phase.");
}

async function handleTransactionPhase(agentKey: VirtualsAgentKey, job: AcpJob) {
  const payload = parseJobPayload(job);
  const offeringKey = resolveOfferingKey(job.name, payload);

  if (!offeringKey) {
    await job.reject("Unsupported offering. Missing offering key during transaction handling.");
    return;
  }

  if (!offeringMatchesAgent(agentKey, offeringKey)) {
    await job.reject("The requested offering does not belong to this YieldPilot provider agent.");
    return;
  }

  try {
    const result =
      agentKey === "yieldpilot-research"
        ? await executeResearchOffering(
            parseResearchSignalInput(
              offeringKey as "analyze_token_launch" | "detect_whale_movements" | "generate_trade_signal",
              payload,
            ),
          )
        : await executeTradePlannerOffering(
            parseTradePlanInput(
              offeringKey as "build_spot_swap_plan" | "build_rebalance_plan",
              payload,
            ),
          );

    await upsertAcpJobAudit({
      agentKey,
      acpJobId: String(job.id),
      offeringKey,
      phase: String(job.phase),
      status: "delivered",
      buyerAddress: job.clientAddress,
      providerAddress: job.providerAddress,
      requestPayload: payload as Record<string, unknown>,
      responsePayload: result.payload as Record<string, unknown>,
    });

    await job.deliver({
      offeringKey: result.offeringKey,
      title: result.title,
      createdAt: result.createdAt,
      payload: result.payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await upsertAcpJobAudit({
      agentKey,
      acpJobId: String(job.id),
      offeringKey,
      phase: String(job.phase),
      status: "failed",
      buyerAddress: job.clientAddress,
      providerAddress: job.providerAddress,
      requestPayload: payload as Record<string, unknown>,
      error: message,
    });
    await job.reject(`YieldPilot could not process the request: ${message}`);
  }
}

async function handleEvaluatePhase(agentKey: VirtualsAgentKey, job: AcpJob) {
  await upsertAcpJobAudit({
    agentKey,
    acpJobId: String(job.id),
    offeringKey: resolveOfferingKey(job.name, parseJobPayload(job)),
    phase: String(job.phase),
    status: "awaiting_evaluation",
    buyerAddress: job.clientAddress,
    providerAddress: job.providerAddress,
  });
}

async function handleJob(agentKey: VirtualsAgentKey, job: AcpJob) {
  if (job.phase === AcpJobPhases.REQUEST || job.phase === AcpJobPhases.NEGOTIATION) {
    await handleRequestPhase(agentKey, job);
    return;
  }

  if (job.phase === AcpJobPhases.TRANSACTION) {
    await handleTransactionPhase(agentKey, job);
    return;
  }

  if (job.phase === AcpJobPhases.EVALUATION) {
    await handleEvaluatePhase(agentKey, job);
  }
}

async function createAcpClient(config: ProviderRuntimeConfig) {
  const contractClient = await AcpContractClientV2.build(
    env.ACP_DEVELOPER_PRIVATE_KEY! as `0x${string}`,
    config.entityId,
    config.walletAddress,
    getAcpConfig(),
    env.ACP_BUILDER_CODE,
  );

  const client = new AcpClient({
    acpContractClient: contractClient,
    onNewTask: (job) => {
      void handleJob(config.agentKey, job);
    },
    onEvaluate: (job) => {
      void handleEvaluatePhase(config.agentKey, job);
    },
  });

  await client.init();
  return client;
}

export async function startVirtualsAcpRuntime() {
  const configs = getProviderRuntimeConfigs();
  if (!configs.length) {
    console.warn("[virtuals] ACP runtime is disabled because required ACP env vars are missing.");
    return [];
  }

  const clients = await Promise.all(configs.map((config) => createAcpClient(config)));
  console.log(`[virtuals] Started ACP runtime for ${clients.length} provider agent(s) in ${env.ACP_ENVIRONMENT} mode.`);
  return clients;
}
