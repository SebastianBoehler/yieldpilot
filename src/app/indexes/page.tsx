import { AllocationChart } from "@/components/charts/allocation-chart";
import { AppShell } from "@/components/layout/app-shell";
import { WalletBar } from "@/components/layout/wallet-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatPercent, formatUsd } from "@/lib/utils/format";
import { getDisplayIndexes } from "@/server/services/index-service";
import type { ConnectedWalletType } from "@/types/domain";

const readinessTone = {
  "agent-ready": "success",
  research: "warning",
  preview: "info",
} as const;

const rebalanceModeLabel = {
  "future-smart-contract": "Future smart contract",
  "future-agent-cron": "Future agent cron",
  hybrid: "Hybrid path",
} as const;

export default async function IndexesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wallet = typeof params.wallet === "string" ? params.wallet : undefined;
  const walletType = params.walletType === "solana" ? "solana" : "evm";
  const indexes = await getDisplayIndexes({
    walletAddress: wallet,
    walletType,
  });

  return (
    <AppShell currentPath="/indexes" walletBar={<WalletBar walletAddress={wallet} walletType={walletType as ConnectedWalletType} />}>
      <div className="space-y-6">
        <Panel className="space-y-5">
          <SectionHeading
            eyebrow="Index studio"
            title="Display-only crypto index products"
            description="These baskets are live site-level index definitions computed from current market data and wallet exposure. They do not trade yet. The goal is to make them ready for later smart-contract basket logic or cron-based agent rebalancing."
          />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Indexes</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{indexes.length}</p>
            </div>
            <div className="rounded-[24px] bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Wallet mode</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{wallet ? walletType.toUpperCase() : "Display only"}</p>
            </div>
            <div className="rounded-[24px] bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Execution status</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">Preview</p>
            </div>
          </div>
        </Panel>

        {indexes.length ? (
          indexes.map((index) => (
            <Panel key={index.key} className="space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone={readinessTone[index.executionReadiness]}>{index.executionReadiness.replace("-", " ")}</Badge>
                    <Badge tone="neutral">{rebalanceModeLabel[index.rebalanceMode]}</Badge>
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{index.name}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{index.description}</p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <div className="rounded-[24px] bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Projected APY</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{formatPercent(index.projectedApy)}</p>
                  </div>
                  <div className="rounded-[24px] bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Reference capital</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{formatUsd(index.referenceCapitalUsd)}</p>
                  </div>
                  <div className="rounded-[24px] bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Wallet coverage</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{index.walletCoveragePct.toFixed(0)}%</p>
                  </div>
                  <div className="rounded-[24px] bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Venue coverage</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{index.opportunityCoveragePct.toFixed(0)}%</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-950">Target composition</p>
                    <div className="mt-4">
                      <AllocationChart
                        data={index.constituents.map((constituent) => ({
                          label: constituent.label,
                          value: constituent.targetUsd,
                        }))}
                      />
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-950">Methodology</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{index.methodology}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {index.constituents.map((constituent) => (
                    <div key={constituent.key} className="rounded-[24px] border border-slate-200 bg-white p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-semibold text-slate-950">{constituent.label}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            Target {constituent.targetWeightPct.toFixed(0)}% · {formatUsd(constituent.targetUsd)}
                          </p>
                        </div>
                        <Badge tone={constituent.bestOpportunity ? "success" : "warning"}>
                          {constituent.bestOpportunity ? "Live venue mapped" : "Venue missing"}
                        </Badge>
                      </div>

                      <div className="mt-4 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                        <div className="flex items-center justify-between gap-3">
                          <span>Current wallet exposure</span>
                          <span className="font-semibold text-slate-900">{formatUsd(constituent.currentUsd)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Drift vs target</span>
                          <span className={`font-semibold ${constituent.driftUsd > 0 ? "text-emerald-700" : constituent.driftUsd < 0 ? "text-amber-700" : "text-slate-900"}`}>
                            {formatUsd(constituent.driftUsd)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Current index weight</span>
                          <span className="font-semibold text-slate-900">
                            {typeof constituent.currentWeightPct === "number" ? `${constituent.currentWeightPct.toFixed(1)}%` : "n/a"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Best venue APY</span>
                          <span className="font-semibold text-slate-900">
                            {constituent.bestOpportunity ? formatPercent(constituent.bestOpportunity.apy) : "n/a"}
                          </span>
                        </div>
                      </div>

                      {constituent.bestOpportunity ? (
                        <p className="mt-4 text-sm leading-6 text-slate-600">
                          Current venue mapping: {constituent.bestOpportunity.chainLabel} via {constituent.bestOpportunity.protocolLabel}.
                        </p>
                      ) : (
                        <p className="mt-4 text-sm leading-6 text-slate-600">
                          No live venue is currently mapped for this constituent in the supported opportunity universe.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          ))
        ) : (
          <EmptyState title="No index products computed" description="YieldPilot could not assemble the live opportunity universe needed to synthesize display-only index products." />
        )}
      </div>
    </AppShell>
  );
}
