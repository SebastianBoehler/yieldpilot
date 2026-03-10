"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { executeTransactionPlan } from "@/lib/wallet/execute-transaction-plan";

type ExecutionPlan = {
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

export function ApprovalActions({
  approvalId,
}: {
  approvalId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<null | string>(null);
  const { address } = useAccount();
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();

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
    if (!address || !switchChainAsync) {
      return;
    }

    setPending("approve_once");
    try {
      const response = await mutate("approve_once");
      const plan = response.plan as ExecutionPlan;
      const results = await executeTransactionPlan({
        account: address,
        config,
        executionPlan: plan,
        switchChain: (chainId) => switchChainAsync({ chainId }),
        onBridgeStatus: async (txHash) => {
          await mutate("bridge_status", {
            txHash,
          });
        },
      });

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
      <Button onClick={approveOnce} disabled={pending !== null || !address}>
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
