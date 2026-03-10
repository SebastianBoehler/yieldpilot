import { getDisplayOpportunityUniverse } from "@/lib/opportunities/universe";
import { getLiveDashboardSnapshot } from "@/server/services/live-portfolio-service";
import type { ConnectedWalletType, DashboardPosition, YieldOpportunity } from "@/types/domain";

type IndexConstituentDefinition = {
  key: string;
  label: string;
  symbolAliases: string[];
  targetWeightPct: number;
  allowedProtocols?: string[];
  allowedChains?: string[];
};

type IndexDefinition = {
  key: string;
  name: string;
  description: string;
  methodology: string;
  executionReadiness: "agent-ready" | "research" | "preview";
  rebalanceMode: "future-smart-contract" | "future-agent-cron" | "hybrid";
  referenceCapitalUsd: number;
  constituents: IndexConstituentDefinition[];
};

export type DisplayIndexConstituent = {
  key: string;
  label: string;
  targetWeightPct: number;
  targetUsd: number;
  currentUsd: number;
  driftUsd: number;
  currentWeightPct?: number;
  bestOpportunity?: {
    chainLabel: string;
    protocolLabel: string;
    apy: number;
  };
};

export type DisplayIndex = {
  key: string;
  name: string;
  description: string;
  methodology: string;
  executionReadiness: IndexDefinition["executionReadiness"];
  rebalanceMode: IndexDefinition["rebalanceMode"];
  referenceCapitalUsd: number;
  projectedApy: number;
  walletCoverageUsd: number;
  walletCoveragePct: number;
  opportunityCoveragePct: number;
  constituents: DisplayIndexConstituent[];
};

const INDEX_DEFINITIONS: IndexDefinition[] = [
  {
    key: "stable-income",
    name: "Stable Income Index",
    description: "Stablecoin-heavy basket designed for future agent-managed treasury rebalancing across the best available low-volatility lending lanes.",
    methodology: "Fixed target weights across stablecoin constituents. YieldPilot maps each constituent to the highest-yield supported venue and computes wallet drift against the target basket.",
    executionReadiness: "agent-ready",
    rebalanceMode: "hybrid",
    referenceCapitalUsd: 10_000,
    constituents: [
      { key: "usdc", label: "USDC", symbolAliases: ["USDC"], targetWeightPct: 40, allowedProtocols: ["aave-v3", "kamino-lend"] },
      { key: "usdt", label: "USDT", symbolAliases: ["USDT"], targetWeightPct: 35, allowedProtocols: ["aave-v3", "kamino-lend"] },
      { key: "dai", label: "DAI", symbolAliases: ["DAI"], targetWeightPct: 25, allowedProtocols: ["aave-v3"] },
    ],
  },
  {
    key: "majors-carry",
    name: "Majors Carry Index",
    description: "Blue-chip crypto basket for future index-style allocation once broader execution support expands beyond the stablecoin lane.",
    methodology: "Fixed target weights across ETH, BTC, and liquid staking exposures. Current projected carry is derived from the best visible venue per constituent.",
    executionReadiness: "research",
    rebalanceMode: "future-agent-cron",
    referenceCapitalUsd: 25_000,
    constituents: [
      { key: "eth", label: "ETH Sleeve", symbolAliases: ["WETH", "ETH", "wstETH"], targetWeightPct: 45, allowedProtocols: ["aave-v3"] },
      { key: "btc", label: "BTC Sleeve", symbolAliases: ["WBTC", "cbBTC"], targetWeightPct: 30, allowedProtocols: ["aave-v3"] },
      { key: "cash", label: "USDC Buffer", symbolAliases: ["USDC"], targetWeightPct: 25, allowedProtocols: ["aave-v3", "kamino-lend"] },
    ],
  },
  {
    key: "solana-income-preview",
    name: "Solana Income Preview",
    description: "Preview basket for SOL and liquid staking assets, suitable for later smart-contract or agent-managed basket logic once Solana execution is integrated.",
    methodology: "Fixed target weights across SOL, liquid staking derivatives, and USDC. This is display-only in phase 1 and uses live Kamino opportunity data where available.",
    executionReadiness: "preview",
    rebalanceMode: "future-smart-contract",
    referenceCapitalUsd: 15_000,
    constituents: [
      { key: "sol", label: "SOL", symbolAliases: ["SOL"], targetWeightPct: 35, allowedProtocols: ["kamino-lend"] },
      { key: "jitosol", label: "JitoSOL", symbolAliases: ["JitoSOL", "JITOSOL"], targetWeightPct: 25, allowedProtocols: ["kamino-lend"] },
      { key: "msol", label: "mSOL", symbolAliases: ["mSOL", "MSOL"], targetWeightPct: 20, allowedProtocols: ["kamino-lend"] },
      { key: "usdc", label: "USDC", symbolAliases: ["USDC"], targetWeightPct: 20, allowedProtocols: ["kamino-lend", "aave-v3"], allowedChains: ["Solana"] },
    ],
  },
];

function resolveConstituentOpportunity(
  constituent: IndexConstituentDefinition,
  opportunities: YieldOpportunity[],
) {
  return opportunities
    .filter((opportunity) => {
      const symbolMatch = constituent.symbolAliases.includes(opportunity.assetSymbol);
      const protocolMatch = !constituent.allowedProtocols?.length || constituent.allowedProtocols.includes(opportunity.protocol);
      const chainMatch = !constituent.allowedChains?.length || constituent.allowedChains.includes(opportunity.chainLabel);

      return symbolMatch && protocolMatch && chainMatch;
    })
    .sort((left, right) => right.apy - left.apy || right.tvlUsd - left.tvlUsd)[0];
}

function resolveWalletExposure(
  constituent: IndexConstituentDefinition,
  positions: DashboardPosition[],
) {
  return positions
    .filter((position) => constituent.symbolAliases.includes(position.assetSymbol))
    .reduce((sum, position) => sum + position.balanceUsd, 0);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function buildDisplayIndex(params: {
  definition: IndexDefinition;
  opportunities: YieldOpportunity[];
  positions: DashboardPosition[];
}) {
  const constituentRows = params.definition.constituents.map((constituent) => {
    const bestOpportunity = resolveConstituentOpportunity(constituent, params.opportunities);
    const currentUsd = resolveWalletExposure(constituent, params.positions);

    return {
      constituent,
      currentUsd,
      bestOpportunity,
    };
  });

  const walletCoverageUsd = constituentRows.reduce((sum, row) => sum + row.currentUsd, 0);
  const referenceCapitalUsd = walletCoverageUsd > 0 ? walletCoverageUsd : params.definition.referenceCapitalUsd;
  const totalTargetWeight = params.definition.constituents.reduce((sum, constituent) => sum + constituent.targetWeightPct, 0) || 100;

  const constituents = constituentRows.map((row) => {
    const targetWeightPct = row.constituent.targetWeightPct;
    const targetUsd = referenceCapitalUsd * (targetWeightPct / totalTargetWeight);
    const currentWeightPct = walletCoverageUsd > 0 ? (row.currentUsd / walletCoverageUsd) * 100 : undefined;

    return {
      key: row.constituent.key,
      label: row.constituent.label,
      targetWeightPct,
      targetUsd,
      currentUsd: row.currentUsd,
      driftUsd: row.currentUsd - targetUsd,
      currentWeightPct,
      bestOpportunity: row.bestOpportunity
        ? {
            chainLabel: row.bestOpportunity.chainLabel,
            protocolLabel: row.bestOpportunity.protocolLabel,
            apy: row.bestOpportunity.apy,
          }
        : undefined,
    } satisfies DisplayIndexConstituent;
  });

  const projectedApy = constituents.reduce((sum, constituent) => {
    const apy = constituent.bestOpportunity?.apy ?? 0;
    return sum + (apy * constituent.targetWeightPct) / 100;
  }, 0);

  const opportunityCoveragePct =
    (constituents.filter((constituent) => Boolean(constituent.bestOpportunity)).length / constituents.length) * 100;
  const walletCoveragePct =
    walletCoverageUsd > 0
      ? (constituents.filter((constituent) => constituent.currentUsd > 0).length / constituents.length) * 100
      : 0;

  return {
    key: params.definition.key,
    name: params.definition.name,
    description: params.definition.description,
    methodology: params.definition.methodology,
    executionReadiness: params.definition.executionReadiness,
    rebalanceMode: params.definition.rebalanceMode,
    referenceCapitalUsd: round2(referenceCapitalUsd),
    projectedApy: round2(projectedApy),
    walletCoverageUsd: round2(walletCoverageUsd),
    walletCoveragePct: round2(walletCoveragePct),
    opportunityCoveragePct: round2(opportunityCoveragePct),
    constituents: constituents.map((constituent) => ({
      ...constituent,
      targetUsd: round2(constituent.targetUsd),
      currentUsd: round2(constituent.currentUsd),
      driftUsd: round2(constituent.driftUsd),
      currentWeightPct: constituent.currentWeightPct === undefined ? undefined : round2(constituent.currentWeightPct),
    })),
  } satisfies DisplayIndex;
}

export async function getDisplayIndexes(params?: {
  walletAddress?: string;
  walletType?: ConnectedWalletType;
}) {
  const [opportunities, snapshot] = await Promise.all([
    getDisplayOpportunityUniverse(),
    params?.walletAddress
      ? getLiveDashboardSnapshot({
          walletAddress: params.walletAddress,
          walletType: params.walletType,
        }).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);
  const positions = snapshot?.positions ?? [];

  return INDEX_DEFINITIONS.map((definition) =>
    buildDisplayIndex({
      definition,
      opportunities,
      positions,
    }),
  );
}
