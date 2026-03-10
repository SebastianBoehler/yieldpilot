import { AllocationChart } from "@/components/charts/allocation-chart";
import { AppShell } from "@/components/layout/app-shell";
import { WalletBar } from "@/components/layout/wallet-bar";
import { RunAgentButton } from "@/components/dashboard/run-agent-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatPercent, formatUsd } from "@/lib/utils/format";
import { getDashboardSnapshot } from "@/server/services/strategy-service";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wallet = typeof params.wallet === "string" ? params.wallet : undefined;
  const snapshot = await getDashboardSnapshot(wallet);

  return (
    <AppShell currentPath="/dashboard" walletBar={<WalletBar walletAddress={snapshot.walletAddress} />}>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Panel className="space-y-6">
          <SectionHeading
            eyebrow="Treasury overview"
            title="Stablecoin allocation at a glance"
            description="YieldPilot tracks the live wallet and Aave lending balances on each supported chain, then compares the current carry with the best routed alternative."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Portfolio value" value={formatUsd(snapshot.totalPortfolioUsd)} />
            <MetricCard label="Effective APY" value={formatPercent(snapshot.effectiveApy)} />
            <MetricCard label="Pending approvals" value={String(snapshot.pendingApprovals)} />
            <MetricCard
              label="Autonomous mode"
              value={snapshot.autonomousModeEnabled ? "On" : "Off"}
              detail={snapshot.loopStatus.scheduleLabel}
            />
          </div>
          {snapshot.currentAllocation.length ? (
            <AllocationChart data={snapshot.currentAllocation} />
          ) : (
            <EmptyState
              title="No live positions yet"
              description="Connect a wallet or configure a default wallet address to let YieldPilot fetch live stablecoin balances and Aave positions."
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
              The agent loop can be run on demand from the UI and on schedule from the worker. Every cycle persists live snapshots, policy evaluation, and the resulting transaction plan.
            </p>
          </div>
          <RunAgentButton walletAddress={snapshot.walletAddress} />
          <div className="rounded-[24px] bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Last decision</p>
            <p className="mt-2 text-sm text-slate-600">{snapshot.lastDecision?.summary ?? "No decisions recorded yet."}</p>
          </div>
          <div className="rounded-[24px] bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Best current opportunity</p>
            <p className="mt-2 text-sm text-slate-600">
              {snapshot.bestOpportunity
                ? `${snapshot.bestOpportunity.chainLabel} ${snapshot.bestOpportunity.assetSymbol} at ${formatPercent(snapshot.bestOpportunity.apy)}`
                : "Run the live scanner to populate opportunities."}
            </p>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
