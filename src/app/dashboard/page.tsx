import { AllocationChart } from "@/components/charts/allocation-chart";
import { AppShell } from "@/components/layout/app-shell";
import { WalletBar } from "@/components/layout/wallet-bar";
import { PositionsTable } from "@/components/dashboard/positions-table";
import { RunAgentButton } from "@/components/dashboard/run-agent-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatPercent, formatUsd } from "@/lib/utils/format";
import { getLiveDashboardSnapshot } from "@/server/services/live-portfolio-service";
import type { ConnectedWalletType } from "@/types/domain";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wallet = typeof params.wallet === "string" ? params.wallet : undefined;
  const walletType = params.walletType === "solana" ? "solana" : "evm";
  const snapshot = await getLiveDashboardSnapshot({
    walletAddress: wallet,
    walletType,
  });

  return (
    <AppShell currentPath="/dashboard" walletBar={<WalletBar walletAddress={snapshot.walletAddress} walletType={snapshot.walletType as ConnectedWalletType | undefined} />}>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Panel className="space-y-6">
          <SectionHeading
            eyebrow="Treasury overview"
            title="Cross-chain treasury allocation at a glance"
            description="YieldPilot tracks the live wallet balances it can see, surfaces Aave and Kamino yield markets across the supported chains, and compares the current carry with the best routed alternative."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Portfolio value" value={formatUsd(snapshot.totalPortfolioUsd)} />
            <MetricCard label="Effective APY" value={formatPercent(snapshot.effectiveApy)} />
            <MetricCard label="Live markets" value={String(snapshot.opportunityCount)} />
            <MetricCard
              label="Autonomous mode"
              value={snapshot.autonomousModeEnabled ? "On" : "Off"}
              detail={snapshot.walletType === "solana" ? "EVM execution only for now" : snapshot.loopStatus.scheduleLabel}
            />
          </div>
          {snapshot.currentAllocation.length ? (
            <div className="space-y-5">
              <AllocationChart data={snapshot.currentAllocation} />
              <PositionsTable positions={snapshot.positions} />
            </div>
          ) : (
            <EmptyState
              title="No live positions yet"
              description="Connect an EVM or Phantom Solana wallet to let YieldPilot fetch live wallet balances and supported yield positions."
            />
          )}
        </Panel>
        <Panel className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Loop controls</p>
          <div className="space-y-3">
            <Badge tone={snapshot.autonomousModeEnabled ? "warning" : "info"}>
              {snapshot.autonomousModeEnabled ? "Autonomous" : "Human approval"}
            </Badge>
            <p className="text-sm leading-6 text-slate-600">
              {snapshot.walletType === "solana"
                ? "Solana wallet support currently focuses on portfolio visibility through Jupiter's official portfolio APIs. Automated yield execution still targets the supported EVM routes."
                : "The agent loop can be run on demand from the UI. In a Vercel preview, this is the fastest way to inspect the live multi-asset opportunity set and the current supported onchain exposure across chains."}
            </p>
          </div>
          <RunAgentButton walletAddress={snapshot.walletAddress} walletType={snapshot.walletType as ConnectedWalletType | undefined} />
          <div className="rounded-[24px] bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Last decision</p>
            <p className="mt-2 text-sm text-slate-600">{snapshot.lastDecision?.summary ?? "No decisions recorded yet."}</p>
          </div>
          <div className="rounded-[24px] bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Best current opportunity</p>
            <p className="mt-2 text-sm text-slate-600">
              {snapshot.bestOpportunity
                ? `${snapshot.bestOpportunity.chainLabel} ${snapshot.bestOpportunity.assetSymbol} at ${formatPercent(snapshot.bestOpportunity.apy)}`
                : snapshot.walletType === "solana"
                  ? "Solana wallet visibility is live. Solana-native yield sourcing is the next adapter."
                  : "Run the live scanner to populate opportunities."}
            </p>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
