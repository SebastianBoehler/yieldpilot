import { AppShell } from "@/components/layout/app-shell";
import { WalletBar } from "@/components/layout/wallet-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { SettingsForm } from "@/components/settings/settings-form";
import { ensureUserStrategy, toStrategyPolicy } from "@/server/services/strategy-service";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wallet = typeof params.wallet === "string" ? params.wallet : undefined;
  const walletType = params.walletType === "solana" ? "solana" : "evm";

  if (walletType === "solana") {
    return (
      <AppShell currentPath="/settings" walletBar={<WalletBar walletAddress={wallet} walletType="solana" />}>
        <Panel className="space-y-6">
          <SectionHeading
            eyebrow="Strategy settings"
            title="Solana strategy configuration is not enabled yet"
            description="Phantom Solana support is live for wallet visibility. Policy editing and automated strategy configuration still target the supported EVM execution path."
          />
          <EmptyState title="EVM-only strategy settings" description="Switch to an EVM wallet to edit policy, autonomy, and rebalance settings." />
        </Panel>
      </AppShell>
    );
  }

  const base = await ensureUserStrategy(wallet);

  return (
    <AppShell currentPath="/settings" walletBar={<WalletBar walletAddress={base?.user.walletAddress} walletType="evm" />}>
      <Panel className="space-y-6">
        <SectionHeading
          eyebrow="Strategy settings"
          title="Policy and autonomy controls"
          description="Adjust the mode, risk profile, throughput limits, and allowlists that gate every YieldPilot rebalance."
        />
        {base ? (
          <SettingsForm
            payload={{
              walletAddress: base.user.walletAddress,
              strategy: {
                mode: base.strategy.mode,
                riskProfile: base.strategy.riskProfile,
                rebalanceThresholdBps: base.strategy.rebalanceThresholdBps,
                maxRebalanceUsd: base.strategy.maxRebalanceUsd,
                maxDailyMovedUsd: base.strategy.maxDailyMovedUsd,
                cooldownMinutes: base.strategy.cooldownMinutes,
                slippageBps: base.strategy.slippageBps,
                emergencyPause: base.strategy.emergencyPause,
                dryRun: base.strategy.dryRun,
              },
              policy: toStrategyPolicy(base.strategy),
            }}
          />
        ) : (
          <EmptyState title="No strategy loaded" description="Connect a wallet to initialize the live strategy profile." />
        )}
      </Panel>
    </AppShell>
  );
}
