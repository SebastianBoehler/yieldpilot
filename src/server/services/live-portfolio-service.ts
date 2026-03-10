import { getAaveStableOpportunities, getAaveStablePositions } from "@/lib/protocols/aave-v3";
import { scheduleLabel } from "@/lib/utils/time";
import type { ConnectedWalletType, DashboardSnapshot } from "@/types/domain";
import { env } from "@/lib/config/env";
import { getDashboardSnapshot } from "@/server/services/strategy-service";
import { getLiveSolanaDashboardSnapshot } from "@/server/services/solana-portfolio-service";

export async function getLiveDashboardSnapshot(params: {
  walletAddress?: string;
  walletType?: ConnectedWalletType;
}): Promise<DashboardSnapshot> {
  const { walletAddress, walletType = "evm" } = params;

  if (!walletAddress) {
    return {
      walletAddress: undefined,
      walletType,
      totalPortfolioUsd: 0,
      effectiveApy: 0,
      pendingApprovals: 0,
      autonomousModeEnabled: false,
      positions: [],
      opportunityCount: 0,
      currentAllocation: [],
      byChain: [],
      loopStatus: {
        scheduleLabel: scheduleLabel(env.AGENT_LOOP_INTERVAL_MINUTES),
      },
    };
  }

  if (walletType === "solana") {
    return getLiveSolanaDashboardSnapshot(walletAddress);
  }

  const [positions, opportunities, persisted] = await Promise.all([
    getAaveStablePositions(walletAddress as `0x${string}`),
    getAaveStableOpportunities(),
    getDashboardSnapshot(walletAddress).catch(() => undefined),
  ]);

  const totalPortfolioUsd = positions.reduce((sum, position) => sum + position.balanceUsd, 0);
  const effectiveApy =
    totalPortfolioUsd === 0
      ? 0
      : positions.reduce((sum, position) => sum + position.balanceUsd * position.apy, 0) / totalPortfolioUsd;

  const chainAgg = new Map<string, number>();
  positions.forEach((position) => {
    chainAgg.set(position.chainLabel, (chainAgg.get(position.chainLabel) ?? 0) + position.balanceUsd);
  });

  return {
    walletAddress,
    walletType: "evm",
    totalPortfolioUsd,
    effectiveApy,
    pendingApprovals: persisted?.pendingApprovals ?? 0,
    autonomousModeEnabled: persisted?.autonomousModeEnabled ?? false,
    positions: positions.map((position) => ({
      id: position.id,
      walletAddress: position.walletAddress,
      chainKey: position.chainKey,
      chainLabel: position.chainLabel,
      protocolLabel: position.protocolLabel,
      assetSymbol: position.assetSymbol,
      assetAddress: position.assetAddress,
      balanceFormatted: position.balanceFormatted,
      balanceUsd: position.balanceUsd,
      apy: position.apy,
      positionType: position.positionType,
      metadata: position.metadata,
    })),
    opportunityCount: opportunities.length,
    currentAllocation: positions.map((position) => ({
      label: `${position.assetSymbol} · ${position.protocolLabel}`,
      value: position.balanceUsd,
    })),
    byChain: Array.from(chainAgg.entries()).map(([label, value]) => ({ label, value })),
    lastDecision: persisted?.lastDecision,
    lastRebalance: persisted?.lastRebalance,
    loopStatus: persisted?.loopStatus ?? {
      scheduleLabel: scheduleLabel(env.AGENT_LOOP_INTERVAL_MINUTES),
    },
    bestOpportunity: opportunities[0],
  };
}
