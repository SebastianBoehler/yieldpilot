import { pollRouteStatus } from "@/lib/lifi/execution";
import { executeSignedTransaction } from "@/lib/wallet/signing-service";
import { env, hasSmartAccountConfig } from "@/lib/config/env";
import type { ActionExecutionBundle } from "@/agent/types";
import type { TransactionExecutionResult } from "@/types/domain";

export type WalletExecutionProvider = {
  mode: ActionExecutionBundle["mode"];
  isAvailable(): boolean;
  canExecute(bundle: ActionExecutionBundle): { supported: boolean; reason?: string };
  execute(bundle: ActionExecutionBundle): Promise<Array<TransactionExecutionResult & { stepKey: string }>>;
};

export class EoaWalletProvider implements WalletExecutionProvider {
  mode: ActionExecutionBundle["mode"] = "eoa";

  isAvailable() {
    return Boolean(env.AGENT_PRIVATE_KEY);
  }

  canExecute() {
    return this.isAvailable()
      ? { supported: true }
      : { supported: false, reason: "AGENT_PRIVATE_KEY is not configured." };
  }

  async execute(bundle: ActionExecutionBundle): Promise<Array<TransactionExecutionResult & { stepKey: string }>> {
    const results: Array<TransactionExecutionResult & { stepKey: string }> = [];

    for (const step of bundle.txSteps) {
      const result = await executeSignedTransaction(step);
      results.push({
        ...result,
        stepKey: step.stepKey,
      });

      if (result.status !== "CONFIRMED") {
        break;
      }

      if (step.transactionType === "bridge" && result.hash) {
        await pollRouteStatus({
          txHash: result.hash,
          bridge: bundle.routeTool ?? "lifi",
          fromChain: step.chainId,
          toChain: Number(step.metadata.toChainId ?? step.chainId),
        });
      }
    }

    return results;
  }
}

export class SmartAccountWalletProvider implements WalletExecutionProvider {
  mode: ActionExecutionBundle["mode"] = "erc4337";

  isAvailable() {
    return hasSmartAccountConfig;
  }

  canExecute(bundle: ActionExecutionBundle) {
    if (!this.isAvailable()) {
      return {
        supported: false,
        reason: "ERC-4337 is not fully configured. Set bundler, paymaster, factory, and signer env vars.",
      };
    }

    if (bundle.txSteps.length !== 1) {
      return {
        supported: false,
        reason: "The current smart account path only supports single-step bundles in phase 1.",
      };
    }

    return {
      supported: false,
      reason: "The ERC-4337 wallet provider is scaffolded but not yet enabled for the current transaction bundle format.",
    };
  }

  async execute(): Promise<Array<TransactionExecutionResult & { stepKey: string }>> {
    throw new Error("ERC-4337 execution is not yet enabled for this bundle.");
  }
}

export class DelegatedExecutionProvider implements WalletExecutionProvider {
  mode: ActionExecutionBundle["mode"] = "delegated-eip7702";

  isAvailable() {
    return env.ENABLE_EIP7702_EXPERIMENTAL;
  }

  canExecute() {
    return {
      supported: false,
      reason: "EIP-7702 execution is scaffolded only in phase 1.",
    };
  }

  async execute(): Promise<Array<TransactionExecutionResult & { stepKey: string }>> {
    throw new Error("EIP-7702 execution is not available in phase 1.");
  }
}

export function createWalletExecutionProviders() {
  return [
    new SmartAccountWalletProvider(),
    new DelegatedExecutionProvider(),
    new EoaWalletProvider(),
  ] satisfies WalletExecutionProvider[];
}
