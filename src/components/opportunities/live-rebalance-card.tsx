"use client";

import { startTransition, useState } from "react";
import { ArrowRightLeft, ExternalLink, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { formatPercent, formatUsd } from "@/lib/utils/format";
import { executeTransactionPlan } from "@/lib/wallet/execute-transaction-plan";

const explorerByChainId: Record<number, string> = {
  42161: "https://arbiscan.io/tx/",
  8453: "https://basescan.org/tx/",
  10: "https://optimistic.etherscan.io/tx/",
};

type PlanResponse = {
  candidate?: {
    sourcePosition: {
      chainLabel: string;
      protocolLabel: string;
      assetSymbol: string;
    };
    destinationOpportunity: {
      chainLabel: string;
      protocolLabel: string;
      assetSymbol: string;
      apy: number;
    };
    amountUsd: number;
    expectedApyDelta: number;
    expectedNetBenefitUsd: number;
    rationale: string;
  };
  policyResult?: {
    allowed: boolean;
    reasons: string[];
  };
  executionPlan?: {
    routeTool: string;
    sourceChainId: number;
    destinationChainId: number;
    bridgeCostUsd: number;
    gasCostUsd: number;
    expectedNetBenefitUsd: number;
    expectedApyDelta: number;
    txSteps: Array<{
      stepKey: string;
      title: string;
      chainId: number;
      to: `0x${string}`;
      data?: `0x${string}`;
      value?: string;
      transactionType: string;
      description: string;
    }>;
  };
};

export function LiveRebalanceCard({
  walletAddress,
}: {
  walletAddress?: string;
}) {
  const router = useRouter();
  const { address } = useAccount();
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();
  const [pending, setPending] = useState<"plan" | "execute" | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [executionResults, setExecutionResults] = useState<Array<{ stepKey: string; status: string; hash?: string; chainId: number }> | null>(null);

  const activeAddress = address ?? walletAddress;

  async function generatePlan() {
    if (!activeAddress) {
      return;
    }

    setPending("plan");
    setExecutionResults(null);

    try {
      const response = await fetch("/api/agent/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: activeAddress,
        }),
      });

      const json = await response.json();
      setPlan(json);
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setPending(null);
    }
  }

  async function executePlan() {
    if (!activeAddress || !plan?.executionPlan || !switchChainAsync) {
      return;
    }

    setPending("execute");

    try {
      const results = await executeTransactionPlan({
        account: activeAddress as `0x${string}`,
        config,
        executionPlan: plan.executionPlan,
        switchChain: (chainId) => switchChainAsync({ chainId }),
        onBridgeStatus: async (txHash) => {
          await fetch("/api/bridge/status", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              txHash,
              bridge: plan.executionPlan?.routeTool,
              fromChain: plan.executionPlan?.sourceChainId,
              toChain: plan.executionPlan?.destinationChainId,
            }),
          });
        },
      });

      setExecutionResults(results);
    } finally {
      setPending(null);
    }
  }

  return (
    <Panel className="space-y-6 bg-slate-950 text-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">1-click rebalance</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight">Build a live route and deposit plan</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            YieldPilot can price a live rebalance for the connected wallet, then execute the full withdraw, approval, LI.FI route, and destination deposit sequence from the browser wallet.
          </p>
        </div>
        <Button onClick={generatePlan} disabled={!activeAddress || pending !== null} className="bg-white text-slate-950 hover:bg-slate-100">
          <Sparkles className="mr-2 size-4" />
          {pending === "plan" ? "Pricing route..." : "Generate live plan"}
        </Button>
      </div>

      {plan?.candidate ? (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <Badge tone={plan.policyResult?.allowed ? "success" : "warning"}>
                {plan.policyResult?.allowed ? "Executable" : "Review needed"}
              </Badge>
              <p className="text-sm text-slate-300">{formatUsd(plan.candidate.amountUsd)} routed capital</p>
            </div>
            <div className="flex items-center gap-3 text-lg font-semibold">
              <span>{plan.candidate.sourcePosition.chainLabel} {plan.candidate.sourcePosition.assetSymbol}</span>
              <ArrowRightLeft className="size-4 text-teal-200" />
              <span>{plan.candidate.destinationOpportunity.chainLabel} {plan.candidate.destinationOpportunity.assetSymbol}</span>
            </div>
            <p className="text-sm leading-6 text-slate-300">{plan.candidate.rationale}</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">APY uplift</p>
                <p className="mt-2 text-xl font-semibold">{formatPercent(plan.candidate.expectedApyDelta)}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Net benefit</p>
                <p className="mt-2 text-xl font-semibold">{formatUsd(plan.candidate.expectedNetBenefitUsd)}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Destination APY</p>
                <p className="mt-2 text-xl font-semibold">{formatPercent(plan.candidate.destinationOpportunity.apy)}</p>
              </div>
            </div>
            {plan.policyResult?.reasons?.length ? (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                {plan.policyResult.reasons.join(" ")}
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Transaction sequence</p>
            {plan.executionPlan?.txSteps.map((step) => (
              <div key={step.stepKey} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{step.title}</p>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{step.transactionType}</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{step.description}</p>
              </div>
            ))}
            <Button
              onClick={executePlan}
              disabled={!plan.executionPlan || !plan.policyResult?.allowed || pending !== null || !activeAddress}
              className="w-full bg-[#0f766e] hover:bg-[#115e59]"
            >
              {pending === "execute" ? "Executing..." : "Execute in connected wallet"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-white/20 px-5 py-8 text-sm text-slate-300">
          Connect a supported EVM wallet and generate a live plan to inspect the exact route, transaction sequence, and destination deposit step.
        </div>
      )}

      {executionResults?.length ? (
        <div className="rounded-[24px] border border-emerald-400/30 bg-emerald-400/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-100">Execution result</p>
          <div className="mt-4 grid gap-3">
            {executionResults.map((result) => (
              <div key={result.stepKey} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-950/30 px-4 py-3 text-sm">
                <span>{result.stepKey}</span>
                <div className="flex items-center gap-3">
                  <Badge tone={result.status === "CONFIRMED" ? "success" : "danger"}>{result.status}</Badge>
                  {result.hash ? (
                    <a
                      href={`${explorerByChainId[result.chainId] ?? "https://etherscan.io/tx/"}${result.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-teal-200 hover:text-teal-100"
                    >
                      View tx
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
