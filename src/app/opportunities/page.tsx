import { OpportunityBarChart } from "@/components/charts/opportunity-bar-chart";
import { LiveRebalanceCard } from "@/components/opportunities/live-rebalance-card";
import { AppShell } from "@/components/layout/app-shell";
import { WalletBar } from "@/components/layout/wallet-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatPercent, formatUsd } from "@/lib/utils/format";
import { selectBestCandidate } from "@/lib/orchestration/rebalance";
import { buildDefaultStrategyPolicy } from "@/server/services/strategy-service";
import type { ConnectedWalletType } from "@/types/domain";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wallet = typeof params.wallet === "string" ? params.wallet : undefined;
  const walletType = params.walletType === "solana" ? "solana" : "evm";

  if (!wallet) {
    return (
      <AppShell currentPath="/opportunities" walletBar={<WalletBar walletType={walletType as ConnectedWalletType} />}>
        <EmptyState title="Connect a wallet first" description="YieldPilot only surfaces live opportunities after it can price your current positions." />
      </AppShell>
    );
  }

  if (walletType === "solana") {
    return (
      <AppShell currentPath="/opportunities" walletBar={<WalletBar walletAddress={wallet} walletType="solana" />}>
        <Panel className="space-y-6">
          <SectionHeading
            eyebrow="Solana wallet support"
            title="Portfolio visibility is live"
            description="Phantom Solana wallet support is active for asset visibility on the dashboard. The current rebalance and yield execution adapters still target the supported EVM Aave plus LI.FI flow."
          />
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-6 text-sm leading-7 text-slate-600">
            Connect a Solana wallet to inspect assets. To route capital and deposit into yield contracts today, switch to the EVM wallet mode. Solana-native yield adapters and transaction flows are the next layer.
          </div>
        </Panel>
      </AppShell>
    );
  }

  const data = await selectBestCandidate({
    walletAddress: wallet as `0x${string}`,
    policy: buildDefaultStrategyPolicy(),
  });

  return (
    <AppShell currentPath="/opportunities" walletBar={<WalletBar walletAddress={wallet} walletType="evm" />}>
      <div className="space-y-6">
        <LiveRebalanceCard walletAddress={wallet} />
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
                      <div className="flex items-center justify-between">
                        <span>Source</span>
                        <span className="font-semibold text-slate-900">Aave RPC</span>
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
      </div>
    </AppShell>
  );
}
