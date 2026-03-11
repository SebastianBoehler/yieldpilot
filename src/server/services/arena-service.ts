import { DecisionStatus, RiskProfile, RunStatus, StrategyMode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ArenaAgentSnapshot, ArenaMarketPulse, ArenaNewsItem, ArenaSnapshot } from "@/types/domain";

const MARKET_ENDPOINT =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,chainlink,aave&price_change_percentage=24h";

const NEWS_FEEDS = [
  {
    source: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
  },
  {
    source: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
  },
];

const FALLBACK_MARKET_PULSE: ArenaMarketPulse[] = [
  { symbol: "BTC", name: "Bitcoin", priceUsd: 0, change24h: 0, source: "fallback" },
  { symbol: "ETH", name: "Ethereum", priceUsd: 0, change24h: 0, source: "fallback" },
  { symbol: "SOL", name: "Solana", priceUsd: 0, change24h: 0, source: "fallback" },
  { symbol: "LINK", name: "Chainlink", priceUsd: 0, change24h: 0, source: "fallback" },
  { symbol: "AAVE", name: "Aave", priceUsd: 0, change24h: 0, source: "fallback" },
];

function decodeXmlEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractXmlTag(input: string, tagName: string) {
  const match = input.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? decodeXmlEntities(match[1]) : undefined;
}

function toIsoStringOrUndefined(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function parseMarketPulseResponse(payload: unknown): ArenaMarketPulse[] {
  if (!Array.isArray(payload)) {
    return FALLBACK_MARKET_PULSE;
  }

  const parsed: ArenaMarketPulse[] = payload
    .map((item) => {
      if (!item || typeof item !== "object") {
        return undefined;
      }

      const record = item as Record<string, unknown>;
      const symbol = typeof record.symbol === "string" ? record.symbol.toUpperCase() : undefined;
      const name = typeof record.name === "string" ? record.name : undefined;
      const priceUsd = typeof record.current_price === "number" ? record.current_price : undefined;
      const change24h =
        typeof record.price_change_percentage_24h_in_currency === "number"
          ? record.price_change_percentage_24h_in_currency
          : typeof record.price_change_percentage_24h === "number"
            ? record.price_change_percentage_24h
            : undefined;

      if (!symbol || !name || typeof priceUsd !== "number" || typeof change24h !== "number") {
        return undefined;
      }

      const result: ArenaMarketPulse = {
        symbol,
        name,
        priceUsd,
        change24h,
        marketCapUsd: typeof record.market_cap === "number" ? record.market_cap : undefined,
        source: "CoinGecko",
      };

      return result;
    })
    .filter((item): item is ArenaMarketPulse => item !== undefined);

  return parsed.length ? parsed : FALLBACK_MARKET_PULSE;
}

export function parseRssFeed(xml: string, source: string): ArenaNewsItem[] {
  const matches = [...xml.matchAll(/<item\b[\s\S]*?>([\s\S]*?)<\/item>/gi)];
  const items: ArenaNewsItem[] = [];

  for (const [index, match] of matches.entries()) {
    const body = match[1];
    const title = extractXmlTag(body, "title");
    const url = extractXmlTag(body, "link");
    const publishedAt =
      toIsoStringOrUndefined(extractXmlTag(body, "pubDate"))
      ?? toIsoStringOrUndefined(extractXmlTag(body, "dc:date"))
      ?? new Date(0).toISOString();

    if (!title || !url) {
      continue;
    }

    const summary =
      extractXmlTag(body, "description")
      ?? extractXmlTag(body, "content:encoded")
      ?? undefined;

    items.push({
      id: `${source.toLowerCase()}-${index}-${publishedAt}`,
      source,
      title,
      url,
      publishedAt,
      summary: summary ? summary.slice(0, 240) : undefined,
    });
  }

  return items;
}

export async function fetchMarketPulse(): Promise<ArenaMarketPulse[]> {
  try {
    const response = await fetch(MARKET_ENDPOINT, {
      next: { revalidate: 300 },
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      return FALLBACK_MARKET_PULSE;
    }

    const payload = await response.json();
    return parseMarketPulseResponse(payload);
  } catch {
    return FALLBACK_MARKET_PULSE;
  }
}

export async function fetchNewsFeed(): Promise<ArenaNewsItem[]> {
  const items = await Promise.all(
    NEWS_FEEDS.map(async (feed) => {
      try {
        const response = await fetch(feed.url, {
          next: { revalidate: 600 },
          headers: {
            accept: "application/rss+xml, application/xml, text/xml",
          },
        });

        if (!response.ok) {
          return [];
        }

        const xml = await response.text();
        return parseRssFeed(xml, feed.source);
      } catch {
        return [];
      }
    }),
  );

  return items
    .flat()
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, 8);
}

export async function getArenaExternalFeeds() {
  const [marketPulse, newsFeed] = await Promise.all([fetchMarketPulse(), fetchNewsFeed()]);

  return {
    marketPulse,
    newsFeed,
  };
}

function toProtocolLabel(protocol: string) {
  if (protocol === "aave-v3") {
    return "Aave V3";
  }

  return protocol;
}

function buildArenaAgentSnapshot(strategy: {
  id: string;
  name: string;
  mode: StrategyMode;
  riskProfile: RiskProfile;
  updatedAt: Date;
  user: { walletAddress: string };
  positions: Array<{ assetSymbol: string; protocol: string; balanceUsd: number; apy: number }>;
  approvalRequests: Array<{ id: string }>;
  actionRequests: Array<{ id: string }>;
  rebalanceDecisions: Array<{ status: DecisionStatus; summary: string; createdAt: Date }>;
  agentRuns: Array<{ status: RunStatus; summary: string | null; startedAt: Date; completedAt: Date | null }>;
  opportunitySnapshots: Array<{ assetSymbol: string; chainKey: string; protocol: string; apy: number }>;
}): ArenaAgentSnapshot {
  const totalPortfolioUsd = strategy.positions.reduce((sum, position) => sum + position.balanceUsd, 0);
  const effectiveApy =
    totalPortfolioUsd === 0
      ? 0
      : strategy.positions.reduce((sum, position) => sum + position.balanceUsd * position.apy, 0) / totalPortfolioUsd;
  const lastDecision = strategy.rebalanceDecisions[0];
  const latestRun = strategy.agentRuns[0];
  const bestOpportunity = strategy.opportunitySnapshots[0];

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    walletAddress: strategy.user.walletAddress,
    mode: strategy.mode,
    riskProfile: strategy.riskProfile,
    totalPortfolioUsd,
    effectiveApy,
    pendingApprovals: strategy.approvalRequests.length,
    recentActionCount: strategy.actionRequests.length,
    updatedAt: strategy.updatedAt.toISOString(),
    lastDecision: lastDecision
      ? {
          status: lastDecision.status,
          summary: lastDecision.summary,
          createdAt: lastDecision.createdAt.toISOString(),
        }
      : undefined,
    latestRun: latestRun
      ? {
          status: latestRun.status,
          summary: latestRun.summary,
          startedAt: latestRun.startedAt.toISOString(),
          completedAt: latestRun.completedAt?.toISOString() ?? null,
        }
      : undefined,
    topAllocations: strategy.positions
      .slice()
      .sort((left, right) => right.balanceUsd - left.balanceUsd)
      .slice(0, 3)
      .map((position) => ({
        label: `${position.assetSymbol} · ${toProtocolLabel(position.protocol)}`,
        value: position.balanceUsd,
      })),
    bestOpportunity: bestOpportunity
      ? {
          assetSymbol: bestOpportunity.assetSymbol,
          chainLabel: bestOpportunity.chainKey,
          protocolLabel: toProtocolLabel(bestOpportunity.protocol),
          apy: bestOpportunity.apy,
        }
      : undefined,
  };
}

export async function getArenaSnapshot(): Promise<ArenaSnapshot> {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24);
  const externalFeeds = await getArenaExternalFeeds();

  if (!process.env.DATABASE_URL) {
    return {
      generatedAt: new Date().toISOString(),
      overview: {
        totalAgents: 0,
        autonomousAgents: 0,
        pendingApprovals: 0,
        trackedTvlUsd: 0,
        actionsLast24h: 0,
      },
      agents: [],
      marketPulse: externalFeeds.marketPulse,
      newsFeed: externalFeeds.newsFeed,
    };
  }

  const strategies = await prisma.strategy.findMany({
    include: {
      user: {
        select: {
          walletAddress: true,
        },
      },
      positions: {
        select: {
          assetSymbol: true,
          protocol: true,
          balanceUsd: true,
          apy: true,
        },
      },
      approvalRequests: {
        where: {
          status: "PENDING",
        },
        select: {
          id: true,
        },
      },
      actionRequests: {
        where: {
          createdAt: {
            gte: since,
          },
        },
        select: {
          id: true,
        },
      },
      rebalanceDecisions: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          status: true,
          summary: true,
          createdAt: true,
        },
      },
      agentRuns: {
        orderBy: {
          startedAt: "desc",
        },
        take: 1,
        select: {
          status: true,
          summary: true,
          startedAt: true,
          completedAt: true,
        },
      },
      opportunitySnapshots: {
        orderBy: {
          apy: "desc",
        },
        take: 1,
        select: {
          assetSymbol: true,
          chainKey: true,
          protocol: true,
          apy: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const agents = strategies.map(buildArenaAgentSnapshot);

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      totalAgents: agents.length,
      autonomousAgents: agents.filter((agent) => agent.mode === StrategyMode.AUTONOMOUS).length,
      pendingApprovals: agents.reduce((sum, agent) => sum + agent.pendingApprovals, 0),
      trackedTvlUsd: agents.reduce((sum, agent) => sum + agent.totalPortfolioUsd, 0),
      actionsLast24h: agents.reduce((sum, agent) => sum + agent.recentActionCount, 0),
    },
    agents,
    marketPulse: externalFeeds.marketPulse,
    newsFeed: externalFeeds.newsFeed,
  };
}
