import { getAaveStableOpportunities, getAaveStablePositions } from "@/lib/protocols/aave-v3";
import { scheduleLabel } from "@/lib/utils/time";
import type { DashboardSnapshot } from "@/types/domain";
import { env } from "@/lib/config/env";
import { getDashboardSnapshot } from "@/server/services/strategy-service";

export async function getLiveDashboardSnapshot(walletAddress?: string): Promise<DashboardSnapshot> {
  if (!walletAddress) {
    return {
      walletAddress: undefined,
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
    totalPortfolioUsd,
    effectiveApy,
    pendingApprovals: persisted?.pendingApprovals ?? 0,
    autonomousModeEnabled: persisted?.autonomousModeEnabled ?? false,
    positions,
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
