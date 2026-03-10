import type { Route, StatusResponse } from "@lifi/types";
import { EVM, executeRoute, getStatus } from "@lifi/sdk";
import type { Client } from "viem";
import { ensureLifiConfig } from "@/lib/lifi/client";

export async function pollRouteStatus(params: {
  txHash: string;
  bridge: string;
  fromChain: number;
  toChain: number;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<StatusResponse> {
  ensureLifiConfig();
  const timeoutMs = params.timeoutMs ?? 10 * 60 * 1000;
  const intervalMs = params.intervalMs ?? 8_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await getStatus({
      txHash: params.txHash,
      bridge: params.bridge,
      fromChain: params.fromChain,
      toChain: params.toChain,
    });

    if (status.status === "DONE" || status.status === "FAILED") {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out while waiting for LI.FI route completion.");
}

export async function executeAutonomousRoute(route: Route, walletClient: Client) {
  ensureLifiConfig();

  EVM({
    getWalletClient: async () => walletClient,
  });

  return executeRoute(route, {
    switchChainHook: async () => walletClient,
    updateRouteHook: () => undefined,
    disableMessageSigning: true,
    executeInBackground: true,
    updateTransactionRequestHook: async (txRequest) => txRequest,
  });
}
