import { OpportunityBarChart } from "@/components/charts/opportunity-bar-chart";
import { LiveRebalanceCard } from "@/components/opportunities/live-rebalance-card";
import { AppShell } from "@/components/layout/app-shell";
import { WalletBar } from "@/components/layout/wallet-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { getDisplayOpportunityUniverse } from "@/lib/opportunities/universe";
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
  const [displayOpportunities, planningData] = await Promise.all([
    getDisplayOpportunityUniverse(),
    wallet && walletType === "evm"
      ? selectBestCandidate({
          walletAddress: wallet as `0x${string}`,
          policy: buildDefaultStrategyPolicy(),
        })
      : Promise.resolve(undefined),
  ]);

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
              description="YieldPilot fetches lending and vault rates from live Aave RPC reads and official Kamino market metrics. A wallet is only required once the app needs to inspect your current positions or prepare a transaction plan."
            />
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-6 text-sm leading-7 text-slate-600">
              Phantom Solana can stay connected for portfolio visibility. Solana opportunities are now surfaced from Kamino, while automated execution still remains on the supported EVM route path.
            </div>
          </Panel>
        ) : (
          <Panel className="space-y-4">
            <SectionHeading
              eyebrow="Market discovery"
              title="Browse opportunities without connecting a wallet"
              description="The rates below come from live Aave RPC reads and the official Kamino reserve metrics feed. Connect an EVM wallet only when you want YieldPilot to compare against your balances and build an executable rebalance transaction sequence."
            />
          </Panel>
        )}
        <Panel className="space-y-6">
          <SectionHeading
            eyebrow="Live opportunity set"
            title="Cross-chain lending and vault markets"
            description="YieldPilot now surfaces stablecoin, ETH, BTC, and SOL-class yield products across the supported chains. The execution engine still prices only the currently supported stablecoin rebalance path."
          />
          {displayOpportunities.length ? (
            <>
              <OpportunityBarChart
                data={displayOpportunities.slice(0, 6).map((opportunity) => ({
                  label: `${opportunity.chainLabel} ${opportunity.assetSymbol}`,
                  apy: opportunity.apy,
                }))}
              />
              <div className="grid gap-4 xl:grid-cols-2">
                {displayOpportunities.slice(0, 10).map((opportunity) => {
                  const sourceLabel =
                    typeof opportunity.metadata.sourceLabel === "string"
                      ? opportunity.metadata.sourceLabel
                      : opportunity.protocolLabel;
                  const executionSupported = opportunity.metadata.executionSupported === true;

                  return (
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
                        <span>Execution</span>
                        <span className="font-semibold text-slate-900">{executionSupported ? "Supported" : "Preview only"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Source</span>
                        <span className="font-semibold text-slate-900">{sourceLabel}</span>
                      </div>
                    </div>
                  </Panel>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState title="No opportunities loaded" description="YieldPilot could not read the current reserve set from the supported chain RPC endpoints." />
          )}
        </Panel>
        {wallet && walletType === "evm" && planningData ? (
          <Panel className="space-y-4">
            <SectionHeading
              eyebrow="Execution scope"
              title="Current auto-execution lane"
              description="The route builder still targets the stablecoin-focused Aave path while broader ETH, BTC, and Solana yield markets are surfaced in discovery mode."
            />
            <div className="grid gap-3 md:grid-cols-3">
              {planningData.opportunities.slice(0, 3).map((opportunity) => (
                <div key={opportunity.id} className="rounded-[24px] border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-950">{opportunity.chainLabel} {opportunity.assetSymbol}</p>
                  <p className="mt-1 text-sm text-slate-600">{opportunity.protocolLabel}</p>
                  <p className="mt-3 text-lg font-semibold text-slate-950">{formatPercent(opportunity.apy)}</p>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
