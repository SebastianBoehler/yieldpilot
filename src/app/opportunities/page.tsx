import { OpportunityBarChart } from "@/components/charts/opportunity-bar-chart";
import { AppShell } from "@/components/layout/app-shell";
import { WalletBar } from "@/components/layout/wallet-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatPercent, formatUsd } from "@/lib/utils/format";
import { selectBestCandidate } from "@/lib/orchestration/rebalance";
import { ensureUserStrategy, toStrategyPolicy } from "@/server/services/strategy-service";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wallet = typeof params.wallet === "string" ? params.wallet : undefined;
  const base = await ensureUserStrategy(wallet);

  if (!base) {
    return (
      <AppShell currentPath="/opportunities" walletBar={<WalletBar />}>
        <EmptyState title="Connect a wallet first" description="YieldPilot only surfaces live opportunities after it can price your current positions." />
      </AppShell>
    );
  }

  const data = await selectBestCandidate({
    walletAddress: base.user.walletAddress as `0x${string}`,
    policy: toStrategyPolicy(base.strategy),
  });

  return (
    <AppShell currentPath="/opportunities" walletBar={<WalletBar walletAddress={base.user.walletAddress} />}>
      <Panel className="space-y-6">
        <SectionHeading
          eyebrow="Live opportunity set"
          title="Stablecoin lending markets"
          description="These rates come from live Aave RPC reads. YieldPilot combines them with LI.FI route costs before it considers a rebalance."
        />
        {data.opportunities.length ? (
          <>
            <OpportunityBarChart
              data={data.opportunities.slice(0, 6).map((opportunity) => ({
                label: `${opportunity.chainLabel} ${opportunity.assetSymbol}`,
                apy: opportunity.apy,
              }))}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              {data.opportunities.slice(0, 8).map((opportunity) => (
                <Panel key={opportunity.id} className="bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">{opportunity.chainLabel} {opportunity.assetSymbol}</p>
                      <p className="mt-1 text-sm text-slate-600">{opportunity.protocolLabel}</p>
                    </div>
                    <Badge tone="info">{formatPercent(opportunity.apy)}</Badge>
                  </div>
                  <div className="mt-5 grid gap-2 text-sm text-slate-600">
                    <div className="flex items-center justify-between">
                      <span>Available liquidity</span>
                      <span className="font-semibold text-slate-900">{formatUsd(opportunity.availableLiquidityUsd)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Total supplied TVL</span>
                      <span className="font-semibold text-slate-900">{formatUsd(opportunity.tvlUsd)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Reserve factor</span>
                      <span className="font-semibold text-slate-900">{opportunity.reserveFactor.toFixed(2)}</span>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          </>
        ) : (
          <EmptyState title="No opportunities loaded" description="Run the app with a supported wallet to load the live Aave reserve set." />
        )}
      </Panel>
    </AppShell>
  );
}
