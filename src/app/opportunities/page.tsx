import { OpportunityBarChart } from "@/components/charts/opportunity-bar-chart";
import { LiveRebalanceCard } from "@/components/opportunities/live-rebalance-card";
import { AppShell } from "@/components/layout/app-shell";
import { WalletBar } from "@/components/layout/wallet-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatPercent, formatUsd } from "@/lib/utils/format";
import { getAaveStableOpportunities } from "@/lib/protocols/aave-v3";
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
  const opportunities = await getAaveStableOpportunities();
  const data =
    wallet && walletType === "evm"
      ? await selectBestCandidate({
          walletAddress: wallet as `0x${string}`,
          policy: buildDefaultStrategyPolicy(),
        })
      : {
          positions: [],
          opportunities,
          candidates: [],
        };

  return (
    <AppShell currentPath="/opportunities" walletBar={<WalletBar walletAddress={wallet} walletType={walletType as ConnectedWalletType} />}>
      <div className="space-y-6">
        {wallet && walletType === "evm" ? (
          <LiveRebalanceCard walletAddress={wallet} />
        ) : walletType === "solana" ? (
          <Panel className="space-y-4">
            <SectionHeading
              eyebrow="Market discovery"
              title="Live opportunities do not require a wallet"
              description="YieldPilot fetches lending markets from supported chain RPC endpoints. A wallet is only required once the app needs to inspect your current positions or prepare a transaction plan."
            />
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-6 text-sm leading-7 text-slate-600">
              Phantom Solana can stay connected for portfolio visibility. These opportunities are still EVM yield destinations, so execution remains EVM-only for now.
            </div>
          </Panel>
        ) : (
          <Panel className="space-y-4">
            <SectionHeading
              eyebrow="Market discovery"
              title="Browse opportunities without connecting a wallet"
              description="The rates below come from live Aave RPC reads on supported chains. Connect an EVM wallet only when you want YieldPilot to compare against your balances and build a rebalance transaction sequence."
            />
          </Panel>
        )}
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
            <EmptyState title="No opportunities loaded" description="YieldPilot could not read the current reserve set from the supported chain RPC endpoints." />
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
