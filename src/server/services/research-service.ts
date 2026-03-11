import { getDisplayIndexes } from "@/server/services/index-service";
import { fetchMarketPulse, fetchNewsFeed } from "@/server/services/arena-service";
import { env } from "@/lib/config/env";
import { runTradingBrief } from "@/lib/adk/trading-brief";
import { runVirtualsResearchSynthesis } from "@/lib/adk/virtuals-research";
import { createResearchSignalRecord, getLatestResearchSignals, getRecentLaunchAnalyses, getSignalHistory, getTrackedWhaleAlerts } from "@/storage/virtuals-store";
import type { AcpOfferingResult, AcpResourcePayload, LaunchAnalysis, ResearchSignalInput, VirtualsAgentKey, VirtualsResourceKey, WhaleAlert } from "@/types/virtuals";

type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  url?: string;
  pairCreatedAt?: number;
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  baseToken?: { symbol?: string; address?: string; name?: string };
};

type ExplorerTransferRow = {
  from?: string;
  to?: string;
  contractAddress?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  value?: string;
  hash?: string;
  timeStamp?: string;
};

type TrackedWhaleConfig = {
  label: string;
  walletAddress: string;
  chainKey: "base" | "arbitrum" | "optimism";
};

function isEvmAddress(value: string | undefined): value is `0x${string}` {
  return Boolean(value?.match(/^0x[a-fA-F0-9]{40}$/));
}

export function parseTrackedWhalesConfig(raw: string): TrackedWhaleConfig[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const configs = parsed.reduce<TrackedWhaleConfig[]>((acc, item) => {
        if (!item || typeof item !== "object") {
          return acc;
        }

        const record = item as Record<string, unknown>;
        const label = typeof record.label === "string" ? record.label : undefined;
        const walletAddress = typeof record.walletAddress === "string" ? record.walletAddress.toLowerCase() : undefined;
        const chainKey = record.chainKey;

        if (!label || !walletAddress || !isEvmAddress(walletAddress) || !["base", "arbitrum", "optimism"].includes(String(chainKey))) {
          return acc;
        }

        acc.push({
          label,
          walletAddress,
          chainKey: chainKey as TrackedWhaleConfig["chainKey"],
        });

        return acc;
      }, []);

    return configs;
  } catch {
    return [];
  }
}

export function parseDexScreenerPairs(payload: unknown): LaunchAnalysis[] {
  const pairs = Array.isArray((payload as { pairs?: unknown[] } | null)?.pairs)
    ? ((payload as { pairs: DexScreenerPair[] }).pairs ?? [])
    : Array.isArray(payload)
      ? (payload as DexScreenerPair[])
      : [];

  const analyses = pairs.reduce<LaunchAnalysis[]>((acc, pair) => {
      const label = pair.baseToken?.symbol ?? pair.baseToken?.name ?? pair.pairAddress;
      if (!label) {
        return acc;
      }

      acc.push({
        query: pair.baseToken?.address ?? label,
        chainKey: typeof pair.chainId === "string" ? pair.chainId : undefined,
        tokenAddress: pair.baseToken?.address,
        pairAddress: pair.pairAddress,
        dexId: pair.dexId,
        label,
        priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
        liquidityUsd: typeof pair.liquidity?.usd === "number" ? pair.liquidity.usd : undefined,
        volume24hUsd: typeof pair.volume?.h24 === "number" ? pair.volume.h24 : undefined,
        priceChange24hPct: typeof pair.priceChange?.h24 === "number" ? pair.priceChange.h24 : undefined,
        pairCreatedAt: typeof pair.pairCreatedAt === "number" ? new Date(pair.pairCreatedAt).toISOString() : undefined,
        url: pair.url,
        metadata: {
          dexId: pair.dexId,
          baseTokenSymbol: pair.baseToken?.symbol,
        },
      } satisfies LaunchAnalysis);

      return acc;
    }, []);

  return analyses.sort((left, right) => (right.liquidityUsd ?? 0) - (left.liquidityUsd ?? 0));
}

function formatTokenAmount(rawValue: string | undefined, decimalsRaw: string | undefined) {
  if (!rawValue) {
    return "0";
  }

  const decimals = Number(decimalsRaw ?? "18");
  if (!Number.isFinite(decimals) || decimals < 0) {
    return rawValue;
  }

  const normalized = Number(rawValue) / 10 ** Math.min(decimals, 18);
  if (!Number.isFinite(normalized)) {
    return rawValue;
  }

  return normalized.toFixed(normalized >= 1 ? 4 : 8).replace(/0+$/, "").replace(/\.$/, "");
}

function estimateAmountUsd(symbol: string | undefined, amount: string, priceBySymbol: Map<string, number>) {
  if (!symbol) {
    return undefined;
  }

  const upper = symbol.toUpperCase();
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount)) {
    return undefined;
  }

  if (["USDC", "USDT", "DAI"].includes(upper)) {
    return parsedAmount;
  }

  const price = priceBySymbol.get(upper);
  return typeof price === "number" ? parsedAmount * price : undefined;
}

export function parseExplorerTransfers(params: {
  payload: unknown;
  walletAddress: string;
  label: string;
  chainKey: "base" | "arbitrum" | "optimism";
  priceBySymbol?: Map<string, number>;
}): WhaleAlert[] {
  const rows = Array.isArray((params.payload as { result?: unknown[] } | null)?.result)
    ? ((params.payload as { result: ExplorerTransferRow[] }).result ?? [])
    : [];

  const alerts = rows.reduce<WhaleAlert[]>((acc, row) => {
      if (!row.hash || !row.tokenSymbol || !row.timeStamp) {
        return acc;
      }

      const walletAddress = params.walletAddress.toLowerCase();
      const from = row.from?.toLowerCase();
      const to = row.to?.toLowerCase();
      const direction = to === walletAddress ? "inflow" : from === walletAddress ? "outflow" : undefined;
      if (!direction) {
        return acc;
      }

      const amount = formatTokenAmount(row.value, row.tokenDecimal);

      acc.push({
        label: params.label,
        walletAddress: params.walletAddress,
        chainKey: params.chainKey,
        direction,
        tokenSymbol: row.tokenSymbol,
        tokenAddress: row.contractAddress,
        amount,
        amountUsd: estimateAmountUsd(row.tokenSymbol, amount, params.priceBySymbol ?? new Map()),
        counterparty: direction === "inflow" ? row.from : row.to,
        txHash: row.hash,
        observedAt: new Date(Number(row.timeStamp) * 1000).toISOString(),
        metadata: {
          from: row.from,
          to: row.to,
        },
      } satisfies WhaleAlert);

      return acc;
    }, []);

  return alerts.sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
}

async function fetchDexScreenerPairs(query: string) {
  const isAddressQuery = isEvmAddress(query);
  const endpoint = isAddressQuery
    ? `${env.ACP_DEXSCREENER_API_URL}/latest/dex/tokens/${query}`
    : `${env.ACP_DEXSCREENER_API_URL}/latest/dex/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`DexScreener request failed with ${response.status}.`);
  }

  return parseDexScreenerPairs(await response.json());
}

function getExplorerConfig(chainKey: TrackedWhaleConfig["chainKey"]) {
  if (chainKey === "arbitrum") {
    return {
      url: env.ACP_ARBISCAN_API_URL,
      apiKey: env.ACP_ARBISCAN_API_KEY,
    };
  }

  if (chainKey === "optimism") {
    return {
      url: env.ACP_OPTIMISM_EXPLORER_API_URL,
      apiKey: env.ACP_OPTIMISM_EXPLORER_API_KEY,
    };
  }

  return {
    url: env.ACP_BASESCAN_API_URL,
    apiKey: env.ACP_BASESCAN_API_KEY,
  };
}

async function fetchWhaleAlerts(input: ResearchSignalInput): Promise<WhaleAlert[]> {
  const tracked = parseTrackedWhalesConfig(env.ACP_TRACKED_WHALES);
  const filtered = input.trackedWallets?.length
    ? tracked.filter((entry) => input.trackedWallets?.map((wallet) => wallet.toLowerCase()).includes(entry.walletAddress))
    : tracked;

  if (!filtered.length) {
    return [];
  }

  const marketPulse = await fetchMarketPulse();
  const priceBySymbol = new Map(marketPulse.map((asset) => [asset.symbol.toUpperCase(), asset.priceUsd]));

  const allAlerts = await Promise.all(
    filtered.map(async (entry) => {
      const explorer = getExplorerConfig(entry.chainKey);
      const url = new URL(explorer.url);
      url.searchParams.set("module", "account");
      url.searchParams.set("action", "tokentx");
      url.searchParams.set("address", entry.walletAddress);
      url.searchParams.set("page", "1");
      url.searchParams.set("offset", String(input.maxItems ?? 10));
      url.searchParams.set("sort", "desc");
      if (explorer.apiKey) {
        url.searchParams.set("apikey", explorer.apiKey);
      }

      try {
        const response = await fetch(url, {
          headers: {
            accept: "application/json",
          },
        });

        if (!response.ok) {
          return [];
        }

        return parseExplorerTransfers({
          payload: await response.json(),
          walletAddress: entry.walletAddress,
          label: entry.label,
          chainKey: entry.chainKey,
          priceBySymbol,
        });
      } catch {
        return [];
      }
    }),
  );

  return allAlerts
    .flat()
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))
    .slice(0, input.maxItems ?? 10);
}

export async function analyzeTokenLaunch(input: ResearchSignalInput): Promise<AcpOfferingResult> {
  if (!input.query) {
    throw new Error("query is required for analyze_token_launch.");
  }

  const [launches, newsFeed] = await Promise.all([fetchDexScreenerPairs(input.query), fetchNewsFeed()]);
  const topLaunch = launches[0] ?? null;

  const facts = [
    topLaunch ? `${topLaunch.label} is visible on ${topLaunch.dexId ?? "a supported DEX"} with liquidity ${topLaunch.liquidityUsd?.toFixed(2) ?? "unknown"} USD.` : "No matching DexScreener pair was found for the query.",
    topLaunch?.volume24hUsd !== undefined ? `24-hour volume is ${topLaunch.volume24hUsd.toFixed(2)} USD.` : "24-hour volume is unavailable.",
    topLaunch?.priceChange24hPct !== undefined ? `24-hour price change is ${topLaunch.priceChange24hPct.toFixed(2)}%.` : "24-hour price change is unavailable.",
    ...(newsFeed.slice(0, 2).map((item) => `${item.source}: ${item.title}`)),
  ].filter(Boolean);

  const risks = [
    topLaunch && (topLaunch.liquidityUsd ?? 0) < 100_000 ? "Liquidity is thin relative to established majors." : "Liquidity should still be validated directly before trading.",
    "DexScreener pair data can move quickly and should not be treated as execution confirmation.",
    "This output is research only and does not authorize autonomous trade execution.",
  ];

  const synthesized = await runVirtualsResearchSynthesis({
    input,
    facts,
    risks,
    context: {
      launch: topLaunch,
      newsFeed: newsFeed.slice(0, 3),
    },
  });

  await createResearchSignalRecord({
    input,
    output: synthesized,
    launchAnalysis: topLaunch,
  });

  return {
    agentKey: "yieldpilot-research",
    offeringKey: "analyze_token_launch",
    title: "YieldPilot token launch analysis",
    payload: {
      ...synthesized,
      launch_analysis: topLaunch,
    },
    createdAt: synthesized.generated_at,
  };
}

export async function detectWhaleMovements(input: ResearchSignalInput): Promise<AcpOfferingResult> {
  const alerts = await fetchWhaleAlerts(input);

  const facts = alerts.length
    ? alerts.slice(0, 5).map((alert) => `${alert.label} ${alert.direction} ${alert.amount} ${alert.tokenSymbol} on ${alert.chainKey} at ${alert.observedAt}.`)
    : ["No recent watchlist transfer activity cleared the current filters."];
  const risks = [
    "Watchlist monitoring is address-specific and does not represent chainwide whale activity.",
    "Transfer data alone does not reveal intent, OTC settlement, or hedging behavior.",
    "This output is research only and does not authorize autonomous trade execution.",
  ];

  const synthesized = await runVirtualsResearchSynthesis({
    input: {
      ...input,
      offeringKey: "detect_whale_movements",
    },
    facts,
    risks,
    context: {
      alerts,
      trackedWalletCount: parseTrackedWhalesConfig(env.ACP_TRACKED_WHALES).length,
    },
  });

  await createResearchSignalRecord({
    input: {
      ...input,
      offeringKey: "detect_whale_movements",
    },
    output: synthesized,
    whaleAlerts: alerts,
  });

  return {
    agentKey: "yieldpilot-research",
    offeringKey: "detect_whale_movements",
    title: "YieldPilot whale movement report",
    payload: {
      ...synthesized,
      whale_alerts: alerts,
    },
    createdAt: synthesized.generated_at,
  };
}

export async function generateTradeSignal(input: ResearchSignalInput): Promise<AcpOfferingResult> {
  const [marketPulse, newsFeed, indexes] = await Promise.all([
    fetchMarketPulse(),
    fetchNewsFeed(),
    getDisplayIndexes({
      walletAddress: input.walletAddress,
      walletType: "evm",
    }),
  ]);
  const brief = await runTradingBrief({
    walletAddress: input.walletAddress ?? "virtuals-signal",
    indexes: indexes.map((index) => ({
      key: index.key,
      name: index.name,
      projectedApy: index.projectedApy,
      description: index.description,
    })),
    marketPulse: marketPulse.map((asset) => ({
      symbol: asset.symbol,
      change24h: asset.change24h,
      priceUsd: asset.priceUsd,
    })),
    newsFeed: newsFeed.map((item) => ({
      source: item.source,
      title: item.title,
      summary: item.summary,
    })),
  });

  const facts = [
    `Market regime is ${brief.marketRegime} with recommended action ${brief.recommendedAction}.`,
    ...brief.focusAssets.map((asset) => `Focus asset: ${asset}.`),
    ...indexes.slice(0, 2).map((index) => `${index.name} shows projected APY ${index.projectedApy.toFixed(2)}%.`),
    ...newsFeed.slice(0, 2).map((item) => `${item.source}: ${item.title}`),
  ];
  const risks = [
    ...brief.riskNotes,
    "Trade signals remain advisory and must still pass YieldPilot policy, simulation, and approval checks.",
  ];

  const synthesized = await runVirtualsResearchSynthesis({
    input: {
      ...input,
      offeringKey: "generate_trade_signal",
    },
    facts,
    risks,
    context: {
      query: input.query,
      brief,
      topIndexes: indexes.slice(0, 3),
      marketPulse: marketPulse.slice(0, 5),
    },
  });

  await createResearchSignalRecord({
    input: {
      ...input,
      offeringKey: "generate_trade_signal",
    },
    output: synthesized,
  });

  return {
    agentKey: "yieldpilot-research",
    offeringKey: "generate_trade_signal",
    title: "YieldPilot trade signal",
    payload: synthesized,
    createdAt: synthesized.generated_at,
  };
}

export async function executeResearchOffering(input: ResearchSignalInput): Promise<AcpOfferingResult> {
  if (input.offeringKey === "analyze_token_launch") {
    return analyzeTokenLaunch(input);
  }

  if (input.offeringKey === "detect_whale_movements") {
    return detectWhaleMovements(input);
  }

  return generateTradeSignal(input);
}

export async function getResearchResourcePayload(agentKey: VirtualsAgentKey, resource: VirtualsResourceKey): Promise<AcpResourcePayload> {
  const updatedAt = new Date().toISOString();
  const trackedWhales = parseTrackedWhalesConfig(env.ACP_TRACKED_WHALES);

  if (resource === "latest_signals") {
    const signals = await getLatestResearchSignals();
    return {
      agentKey,
      resource,
      description: "Recent YieldPilot research outputs.",
      updatedAt,
      data: { signals },
    };
  }

  if (resource === "tracked_whales") {
    const alerts = await getTrackedWhaleAlerts();
    return {
      agentKey,
      resource,
      description: "Tracked whale wallets and their recent alerts.",
      updatedAt,
      data: { trackedWhales, alerts },
    };
  }

  if (resource === "recent_launches") {
    const launches = await getRecentLaunchAnalyses();
    return {
      agentKey,
      resource,
      description: "Recent launch analyses sourced from DexScreener.",
      updatedAt,
      data: { launches },
    };
  }

  if (resource === "signal_history") {
    const history = await getSignalHistory();
    return {
      agentKey,
      resource,
      description: "Historical YieldPilot research outputs.",
      updatedAt,
      data: { history },
    };
  }

  if (resource === "supported_chains") {
    return {
      agentKey,
      resource,
      description: "YieldPilot chain support.",
      updatedAt,
      data: {
        researchChains: ["base", "arbitrum", "optimism"],
        planningChains: ["base", "arbitrum", "optimism"],
      },
    };
  }

  return {
    agentKey,
    resource,
    description: "YieldPilot methodology and runtime boundaries.",
    updatedAt,
    data: {
      routing: "LI.FI powers spot routing, bridge routing, and transaction bundle construction.",
      execution: "ACP services are non-custodial and never directly execute user principal transfers.",
      researchInputs: ["DexScreener", "CoinGecko", "DefiLlama", "RSS feeds", "watchlist-based explorer lookups"],
      controls: ["policy checks", "simulation requirements", "approval-gated execution handoff"],
    },
  };
}
