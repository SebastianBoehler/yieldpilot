import { env, hasSmartAccountConfig } from "@/lib/config/env";
import type { ActionExecutionBundle, AgentActionRequest, SponsorshipQuote } from "@/agent/types";

export interface GasSponsorProvider {
  supports(request: AgentActionRequest): boolean;
  sponsor(bundle: ActionExecutionBundle, request: AgentActionRequest): Promise<SponsorshipQuote>;
  getSponsorshipMetadata(): Record<string, unknown>;
}

export class PimlicoGasSponsorProvider implements GasSponsorProvider {
  supports(request: AgentActionRequest) {
    if (!env.ENABLE_GAS_SPONSORSHIP || !hasSmartAccountConfig) {
      return false;
    }

    return ["aave-v3", "lifi"].includes(request.protocol);
  }

  async sponsor(bundle: ActionExecutionBundle, request: AgentActionRequest): Promise<SponsorshipQuote> {
    if (!this.supports(request)) {
      return {
        eligible: false,
        sponsored: false,
        mode: "fallback",
        reason: "Gas sponsorship is disabled or unsupported for this protocol.",
        metadata: this.getSponsorshipMetadata(),
      };
    }

    return {
      eligible: true,
      sponsored: bundle.mode === "erc4337",
      mode: bundle.mode === "erc4337" ? "paymaster" : "fallback",
      reason: bundle.mode === "erc4337" ? undefined : "Execution fell back to the configured wallet provider.",
      metadata: {
        ...this.getSponsorshipMetadata(),
        protocol: request.protocol,
        actionKind: request.kind,
      },
    };
  }

  getSponsorshipMetadata() {
    return {
      provider: "pimlico-compatible",
      bundlerRpcUrlConfigured: Boolean(env.ERC4337_BUNDLER_RPC_URL),
      paymasterRpcUrlConfigured: Boolean(env.ERC4337_PAYMASTER_RPC_URL),
      smartAccountFactoryConfigured: Boolean(env.SMART_ACCOUNT_FACTORY_ADDRESS),
    };
  }
}
