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
  rankingMetricLabel?: string;
  rankingMetricSource?: string;
  constituents: IndexConstituentDefinition[];
};

type CoinGeckoMarketRow = {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h?: number;
};

type DefiLlamaProtocolRow = {
  id: string;
  name: string;
  symbol?: string | null;
  category?: string | null;
  tvl?: number | null;
  change_1d?: number | null;
  chain?: string | null;
};

type DefiLlamaFeeProtocolRow = {
  id: string;
  name: string;
  displayName?: string | null;
  category?: string | null;
  total24h?: number | null;
  total7d?: number | null;
  protocolType?: string | null;
  chains?: string[] | null;
};

export type DisplayIndexConstituent = {
  key: string;
  label: string;
  targetWeightPct: number;
  targetUsd: number;
  currentUsd: number;
  driftUsd: number;
  currentWeightPct?: number;
  sourceMetricLabel?: string;
  sourceMetricValue?: number;
  sourceMetricUnit?: "usd" | "percent";
  sourceLabel?: string;
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
  rankingMetricLabel?: string;
  rankingMetricSource?: string;
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

const EXTERNAL_INDEX_CACHE_TTL_MS = 5 * 60_000;
let cachedExternalIndexes: { at: number; indexes: DisplayIndex[] } | undefined;

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

function averageProjectedApy(constituents: DisplayIndexConstituent[]) {
  return constituents.reduce((sum, constituent) => {
    const apy = constituent.bestOpportunity?.apy ?? 0;
    return sum + (apy * constituent.targetWeightPct) / 100;
  }, 0);
}

function buildDisplayIndex(params: {
  definition: IndexDefinition;
  opportunities: YieldOpportunity[];
  positions: DashboardPosition[];
}): DisplayIndex {
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
    projectedApy: round2(averageProjectedApy(constituents)),
    walletCoverageUsd: round2(walletCoverageUsd),
    walletCoveragePct: round2(walletCoveragePct),
    opportunityCoveragePct: round2(opportunityCoveragePct),
    rankingMetricLabel: params.definition.rankingMetricLabel,
    rankingMetricSource: params.definition.rankingMetricSource,
    constituents: constituents.map((constituent) => ({
      ...constituent,
      targetUsd: round2(constituent.targetUsd),
      currentUsd: round2(constituent.currentUsd),
      driftUsd: round2(constituent.driftUsd),
      currentWeightPct: constituent.currentWeightPct === undefined ? undefined : round2(constituent.currentWeightPct),
    })),
  } satisfies DisplayIndex;
}

async function fetchCoinGeckoCategoryLeaders(category: string): Promise<CoinGeckoMarketRow[]> {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=${encodeURIComponent(category)}&order=market_cap_desc&per_page=10&page=1&sparkline=false`,
      {
        next: { revalidate: 300 },
        headers: {
          accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as CoinGeckoMarketRow[];
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

async function fetchDefiLlamaTvlLeaders(): Promise<DefiLlamaProtocolRow[]> {
  try {
    const response = await fetch("https://api.llama.fi/protocols", {
      next: { revalidate: 300 },
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as DefiLlamaProtocolRow[];
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .filter((protocol) =>
        typeof protocol.name === "string" &&
        typeof protocol.tvl === "number" &&
        protocol.tvl > 0 &&
        !["CEX", "Chain", "Chain Wrapper", "Yield Aggregator"].includes(protocol.category ?? ""),
      )
      .sort((left, right) => (right.tvl ?? 0) - (left.tvl ?? 0))
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function fetchDefiLlamaFeeLeaders(): Promise<DefiLlamaFeeProtocolRow[]> {
  try {
    const response = await fetch(
      "https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyFees",
      {
        next: { revalidate: 300 },
        headers: {
          accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { protocols?: DefiLlamaFeeProtocolRow[] };
    if (!Array.isArray(payload.protocols)) {
      return [];
    }

    return payload.protocols
      .filter((protocol) =>
        typeof protocol.name === "string" &&
        typeof protocol.total24h === "number" &&
        protocol.total24h > 0 &&
        protocol.protocolType === "protocol",
      )
      .sort((left, right) => (right.total24h ?? 0) - (left.total24h ?? 0))
      .slice(0, 10);
  } catch {
    return [];
  }
}

function buildMarketDataIndex(params: {
  key: string;
  name: string;
  description: string;
  methodology: string;
  executionReadiness: "agent-ready" | "research" | "preview";
  rebalanceMode: "future-smart-contract" | "future-agent-cron" | "hybrid";
  referenceCapitalUsd: number;
  rankingMetricLabel: string;
  rankingMetricSource: string;
  rows: Array<{
    key: string;
    label: string;
    symbolAliases: string[];
    metricValue: number;
    metricUnit: "usd" | "percent";
    sourceLabel: string;
  }>;
  opportunities: YieldOpportunity[];
  positions: DashboardPosition[];
}): DisplayIndex {
  const targetWeightPct = params.rows.length ? 100 / params.rows.length : 0;
  const walletCoverageUsd = params.rows.reduce((sum, row) => {
    const currentUsd = resolveWalletExposure(
      {
        key: row.key,
        label: row.label,
        symbolAliases: row.symbolAliases,
        targetWeightPct,
      },
      params.positions,
    );

    return sum + currentUsd;
  }, 0);
  const referenceCapitalUsd = walletCoverageUsd > 0 ? walletCoverageUsd : params.referenceCapitalUsd;

  const constituents = params.rows.map((row) => {
    const currentUsd = resolveWalletExposure(
      {
        key: row.key,
        label: row.label,
        symbolAliases: row.symbolAliases,
        targetWeightPct,
      },
      params.positions,
    );
    const bestOpportunity = resolveConstituentOpportunity(
      {
        key: row.key,
        label: row.label,
        symbolAliases: row.symbolAliases,
        targetWeightPct,
      },
      params.opportunities,
    );
    const targetUsd = referenceCapitalUsd * (targetWeightPct / 100);
    const currentWeightPct = walletCoverageUsd > 0 ? (currentUsd / walletCoverageUsd) * 100 : undefined;

    return {
      key: row.key,
      label: row.label,
      targetWeightPct,
      targetUsd: round2(targetUsd),
      currentUsd: round2(currentUsd),
      driftUsd: round2(currentUsd - targetUsd),
      currentWeightPct: currentWeightPct === undefined ? undefined : round2(currentWeightPct),
      sourceMetricLabel: params.rankingMetricLabel,
      sourceMetricValue: row.metricValue,
      sourceMetricUnit: row.metricUnit,
      sourceLabel: row.sourceLabel,
      bestOpportunity: bestOpportunity
        ? {
            chainLabel: bestOpportunity.chainLabel,
            protocolLabel: bestOpportunity.protocolLabel,
            apy: bestOpportunity.apy,
          }
        : undefined,
    } satisfies DisplayIndexConstituent;
  });

  const opportunityCoveragePct =
    constituents.length === 0
      ? 0
      : (constituents.filter((constituent) => Boolean(constituent.bestOpportunity)).length / constituents.length) * 100;
  const walletCoveragePct =
    walletCoverageUsd > 0
      ? (constituents.filter((constituent) => constituent.currentUsd > 0).length / constituents.length) * 100
      : 0;

  return {
    key: params.key,
    name: params.name,
    description: params.description,
    methodology: params.methodology,
    executionReadiness: params.executionReadiness,
    rebalanceMode: params.rebalanceMode,
    referenceCapitalUsd: round2(referenceCapitalUsd),
    projectedApy: round2(averageProjectedApy(constituents)),
    walletCoverageUsd: round2(walletCoverageUsd),
    walletCoveragePct: round2(walletCoveragePct),
    opportunityCoveragePct: round2(opportunityCoveragePct),
    rankingMetricLabel: params.rankingMetricLabel,
    rankingMetricSource: params.rankingMetricSource,
    constituents,
  };
}

async function getExternalResearchIndexes(params: {
  opportunities: YieldOpportunity[];
  positions: DashboardPosition[];
}) {
  if (cachedExternalIndexes && Date.now() - cachedExternalIndexes.at < EXTERNAL_INDEX_CACHE_TTL_MS) {
    return cachedExternalIndexes.indexes;
  }

  const [depinLeaders, tvlLeaders, feeLeaders] = await Promise.all([
    fetchCoinGeckoCategoryLeaders("depin"),
    fetchDefiLlamaTvlLeaders(),
    fetchDefiLlamaFeeLeaders(),
  ]);

  const indexes: DisplayIndex[] = [];

  if (depinLeaders.length) {
    indexes.push(
      buildMarketDataIndex({
        key: "depin-market-leaders",
        name: "Top 10 DePIN Index",
        description: "Equal-weight DePIN basket sourced from CoinGecko's public DePIN category, intended as a research sleeve for future spot-routing and Solana/EVM execution support.",
        methodology: "Uses the top ten CoinGecko DePIN assets by market capitalization. YieldPilot tracks wallet exposure by symbol and maps supported venue opportunities where they exist.",
        executionReadiness: "research",
        rebalanceMode: "future-agent-cron",
        referenceCapitalUsd: 20_000,
        rankingMetricLabel: "Market cap",
        rankingMetricSource: "CoinGecko category markets",
        rows: depinLeaders.map((asset) => ({
          key: asset.id,
          label: `${asset.name} (${asset.symbol.toUpperCase()})`,
          symbolAliases: [asset.symbol.toUpperCase()],
          metricValue: asset.market_cap,
          metricUnit: "usd",
          sourceLabel: "CoinGecko",
        })),
        opportunities: params.opportunities,
        positions: params.positions,
      }),
    );
  }

  if (tvlLeaders.length) {
    indexes.push(
      buildMarketDataIndex({
        key: "protocol-tvl-leaders",
        name: "Top 10 TVL Protocol Index",
        description: "Protocol-weighted research basket sourced from the public DefiLlama protocols API, focused on the largest venues by TVL rather than only currently supported execution rails.",
        methodology: "Uses the top ten non-chain, non-CEX protocols by current TVL from DefiLlama's free protocols endpoint. YieldPilot maps wallet symbol overlap and any supported venue opportunities where possible.",
        executionReadiness: "preview",
        rebalanceMode: "future-agent-cron",
        referenceCapitalUsd: 25_000,
        rankingMetricLabel: "TVL",
        rankingMetricSource: "DefiLlama protocols API",
        rows: tvlLeaders.map((protocol) => ({
          key: protocol.id,
          label: `${protocol.name}${protocol.category ? ` · ${protocol.category}` : ""}`,
          symbolAliases: protocol.symbol && protocol.symbol !== "-" ? [protocol.symbol.toUpperCase()] : [],
          metricValue: protocol.tvl ?? 0,
          metricUnit: "usd",
          sourceLabel: "DefiLlama",
        })),
        opportunities: params.opportunities,
        positions: params.positions,
      }),
    );
  }

  if (feeLeaders.length) {
    indexes.push(
      buildMarketDataIndex({
        key: "protocol-fee-leaders",
        name: "Top 10 Fee Leaders Index",
        description: "Research basket sourced from DefiLlama's public fees overview endpoint, focused on protocols generating the most daily fees across major chains.",
        methodology: "Uses the top ten protocols by 24-hour fees from DefiLlama's public fees API. YieldPilot treats this as a research universe and only maps supported wallet/opportunity overlap where possible.",
        executionReadiness: "preview",
        rebalanceMode: "future-agent-cron",
        referenceCapitalUsd: 25_000,
        rankingMetricLabel: "Fees 24h",
        rankingMetricSource: "DefiLlama fees API",
        rows: feeLeaders.map((protocol) => ({
          key: protocol.id,
          label: `${protocol.displayName ?? protocol.name}${protocol.category ? ` · ${protocol.category}` : ""}`,
          symbolAliases: [],
          metricValue: protocol.total24h ?? 0,
          metricUnit: "usd",
          sourceLabel: "DefiLlama",
        })),
        opportunities: params.opportunities,
        positions: params.positions,
      }),
    );
  }

  cachedExternalIndexes = {
    at: Date.now(),
    indexes,
  };

  return indexes;
}

export async function getDisplayIndexes(params?: {
  walletAddress?: string;
  walletType?: ConnectedWalletType;
}): Promise<DisplayIndex[]> {
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

  const fixedIndexes = INDEX_DEFINITIONS.map((definition) =>
    buildDisplayIndex({
      definition,
      opportunities,
      positions,
    }),
  );
  const externalResearchIndexes = await getExternalResearchIndexes({
    opportunities,
    positions,
  });

  return [...fixedIndexes, ...externalResearchIndexes];
}
