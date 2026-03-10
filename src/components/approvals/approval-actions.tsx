"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type TxStep = {
  stepKey: string;
  title: string;
  transactionType: string;
  chainId: number;
  to: string;
  data?: string;
  value?: string;
};

type ExecutionPlan = {
  routeTool: string;
  sourceChainId: number;
  destinationChainId: number;
  txSteps: TxStep[];
};

function toHex(value: number | bigint) {
  return `0x${BigInt(value).toString(16)}`;
}

async function switchChain(chainId: number) {
  await window.ethereum?.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: toHex(chainId) }],
  });
}

async function sendTransaction(step: TxStep) {
  const txHash = await window.ethereum?.request({
    method: "eth_sendTransaction",
    params: [
      {
        to: step.to,
        data: step.data,
        value: step.value ? toHex(BigInt(step.value)) : undefined,
      },
    ],
  });

  return txHash as string;
}

async function waitForReceipt(hash: string) {
  while (true) {
    const receipt = await window.ethereum?.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    });

    if (receipt) {
      return receipt as { status: string };
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

export function ApprovalActions({
  approvalId,
}: {
  approvalId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<null | string>(null);

  async function mutate(action: string, payload?: Record<string, unknown>) {
    const response = await fetch(`/api/approvals/${approvalId}/decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        ...payload,
      }),
    });

    return response.json();
  }

  async function approveOnce() {
    if (!window.ethereum) {
      return;
    }

    setPending("approve_once");
    try {
      const response = await mutate("approve_once");
      const plan = response.plan as ExecutionPlan;
      const results: Array<{ stepKey: string; chainId: number; status: string; hash?: string }> = [];

      for (const step of plan.txSteps) {
        await switchChain(step.chainId);
        const hash = await sendTransaction(step);
        const receipt = await waitForReceipt(hash);
        results.push({
          stepKey: step.stepKey,
          chainId: step.chainId,
          status: receipt.status === "0x1" ? "CONFIRMED" : "FAILED",
          hash,
        });

        if (step.transactionType === "bridge") {
          await mutate("bridge_status", {
            txHash: hash,
          });
        }
      }

      await mutate("record_execution", {
        results,
      });

      startTransition(() => {
        router.refresh();
      });
    } finally {
      setPending(null);
    }
  }

  async function reject() {
    setPending("reject");
    try {
      await mutate("reject");
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setPending(null);
    }
  }

  async function trustProtocol() {
    setPending("trust_protocol");
    try {
      await mutate("trust_protocol");
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setPending(null);
    }
  }

  async function setThreshold() {
    const maxAmountUsd = window.prompt("Auto-approve this protocol up to which USD amount?", "1000");
    if (!maxAmountUsd) {
      return;
    }

    setPending("set_threshold");
    try {
      await mutate("set_threshold", {
        maxAmountUsd: Number(maxAmountUsd),
      });
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={approveOnce} disabled={pending !== null}>
        {pending === "approve_once" ? "Executing..." : "Approve once"}
      </Button>
      <Button variant="secondary" onClick={trustProtocol} disabled={pending !== null}>
        Trust protocol
      </Button>
      <Button variant="secondary" onClick={setThreshold} disabled={pending !== null}>
        Set threshold
      </Button>
      <Button variant="danger" onClick={reject} disabled={pending !== null}>
        Reject
      </Button>
    </div>
  );
}
