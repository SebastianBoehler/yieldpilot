"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import type { StrategyMode, RiskProfile } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { StrategyPolicy } from "@/types/domain";

type SettingsPayload = {
  walletAddress: string;
  strategy: {
    mode: StrategyMode;
    riskProfile: RiskProfile;
    rebalanceThresholdBps: number;
    maxRebalanceUsd: number;
    maxDailyMovedUsd: number;
    cooldownMinutes: number;
    slippageBps: number;
    emergencyPause: boolean;
    dryRun: boolean;
  };
  policy: StrategyPolicy;
};

export function SettingsForm({ payload }: { payload: SettingsPayload }) {
  const router = useRouter();
  const [form, setForm] = useState({
    mode: payload.strategy.mode,
    riskProfile: payload.strategy.riskProfile,
    rebalanceThresholdBps: payload.strategy.rebalanceThresholdBps,
    maxRebalanceUsd: payload.strategy.maxRebalanceUsd,
    maxDailyMovedUsd: payload.strategy.maxDailyMovedUsd,
    cooldownMinutes: payload.strategy.cooldownMinutes,
    slippageBps: payload.strategy.slippageBps,
    emergencyPause: payload.strategy.emergencyPause,
    dryRun: payload.strategy.dryRun,
    approvedChains: payload.policy.approvedChains.join(","),
    approvedProtocols: payload.policy.approvedProtocols.join(","),
    approvedAssets: payload.policy.approvedAssets.join(","),
    maxTransactionUsd: payload.policy.maxTransactionUsd,
    minNetBenefitUsd: payload.policy.minNetBenefitUsd,
    autoApproveTrustedProtocols: payload.policy.autoApproveTrustedProtocols,
  });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: payload.walletAddress,
          mode: form.mode,
          riskProfile: form.riskProfile,
          rebalanceThresholdBps: Number(form.rebalanceThresholdBps),
          maxRebalanceUsd: Number(form.maxRebalanceUsd),
          maxDailyMovedUsd: Number(form.maxDailyMovedUsd),
          cooldownMinutes: Number(form.cooldownMinutes),
          slippageBps: Number(form.slippageBps),
          emergencyPause: form.emergencyPause,
          dryRun: form.dryRun,
          approvedChains: form.approvedChains.split(",").map((value) => Number(value.trim())).filter(Boolean),
          approvedProtocols: form.approvedProtocols.split(",").map((value) => value.trim()).filter(Boolean),
          approvedAssets: form.approvedAssets.split(",").map((value) => value.trim()).filter(Boolean),
          maxTransactionUsd: Number(form.maxTransactionUsd),
          minNetBenefitUsd: Number(form.minNetBenefitUsd),
          autoApproveTrustedProtocols: form.autoApproveTrustedProtocols,
        }),
      });

      startTransition(() => {
        router.refresh();
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-4 lg:grid-cols-2" onSubmit={onSubmit}>
      <Panel className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-950">Execution policy</h3>
        <label className="grid gap-2 text-sm text-slate-700">
          Mode
          <select
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            value={form.mode}
            onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value as StrategyMode }))}
          >
            <option value="HUMAN_APPROVAL">Human approval</option>
            <option value="AUTONOMOUS">Autonomous</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          Risk profile
          <select
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            value={form.riskProfile}
            onChange={(event) => setForm((current) => ({ ...current, riskProfile: event.target.value as RiskProfile }))}
          >
            <option value="CONSERVATIVE">Conservative</option>
            <option value="BALANCED">Balanced</option>
            <option value="AGGRESSIVE">Aggressive</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          Minimum rebalance threshold (bps)
          <input
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            type="number"
            value={form.rebalanceThresholdBps}
            onChange={(event) => setForm((current) => ({ ...current, rebalanceThresholdBps: Number(event.target.value) }))}
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          Max rebalance amount (USD)
          <input
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            type="number"
            value={form.maxRebalanceUsd}
            onChange={(event) => setForm((current) => ({ ...current, maxRebalanceUsd: Number(event.target.value) }))}
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          Max daily moved capital (USD)
          <input
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            type="number"
            value={form.maxDailyMovedUsd}
            onChange={(event) => setForm((current) => ({ ...current, maxDailyMovedUsd: Number(event.target.value) }))}
          />
        </label>
      </Panel>
      <Panel className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-950">Allowlists</h3>
        <label className="grid gap-2 text-sm text-slate-700">
          Approved chains
          <input
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            value={form.approvedChains}
            onChange={(event) => setForm((current) => ({ ...current, approvedChains: event.target.value }))}
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          Approved protocols
          <input
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            value={form.approvedProtocols}
            onChange={(event) => setForm((current) => ({ ...current, approvedProtocols: event.target.value }))}
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          Approved assets
          <input
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            value={form.approvedAssets}
            onChange={(event) => setForm((current) => ({ ...current, approvedAssets: event.target.value }))}
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          Max transaction amount (USD)
          <input
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            type="number"
            value={form.maxTransactionUsd}
            onChange={(event) => setForm((current) => ({ ...current, maxTransactionUsd: Number(event.target.value) }))}
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          Minimum net benefit (USD)
          <input
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            type="number"
            value={form.minNetBenefitUsd}
            onChange={(event) => setForm((current) => ({ ...current, minNetBenefitUsd: Number(event.target.value) }))}
          />
        </label>
      </Panel>
      <Panel className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap gap-6 text-sm text-slate-700">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.emergencyPause}
              onChange={(event) => setForm((current) => ({ ...current, emergencyPause: event.target.checked }))}
            />
            Emergency pause
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.dryRun}
              onChange={(event) => setForm((current) => ({ ...current, dryRun: event.target.checked }))}
            />
            Dry-run mode
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.autoApproveTrustedProtocols}
              onChange={(event) => setForm((current) => ({ ...current, autoApproveTrustedProtocols: event.target.checked }))}
            />
            Auto-approve trusted protocols
          </label>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save strategy"}
        </Button>
      </Panel>
    </form>
  );
}
