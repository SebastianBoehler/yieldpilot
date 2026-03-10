import { sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import type { Config } from "wagmi";
import type { TransactionExecutionResult } from "@/types/domain";

type ExecutablePlan = {
  routeTool: string;
  sourceChainId: number;
  destinationChainId: number;
  txSteps: Array<{
    stepKey: string;
    chainId: number;
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: string;
    transactionType: string;
  }>;
};

export async function executeTransactionPlan(params: {
  account: `0x${string}`;
  config: Config;
  executionPlan: ExecutablePlan;
  switchChain: (chainId: number) => Promise<unknown>;
  onBridgeStatus?: (txHash: string) => Promise<unknown>;
}) {
  const results: Array<TransactionExecutionResult & { stepKey: string }> = [];

  for (const step of params.executionPlan.txSteps) {
    await params.switchChain(step.chainId);

    const hash = await sendTransaction(params.config, {
      account: params.account,
      chainId: step.chainId,
      to: step.to,
      data: step.data,
      value: step.value ? BigInt(step.value) : undefined,
    });

    const receipt = await waitForTransactionReceipt(params.config, {
      chainId: step.chainId,
      hash,
    });

    const status = receipt.status === "success" ? "CONFIRMED" : "FAILED";
    results.push({
      stepKey: step.stepKey,
      chainId: step.chainId,
      hash,
      status,
    });

    if (status !== "CONFIRMED") {
      break;
    }

    if (step.transactionType === "bridge" && params.onBridgeStatus) {
      await params.onBridgeStatus(hash);
    }
  }

  return results;
}
