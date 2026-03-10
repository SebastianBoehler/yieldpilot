import { LIFI_SOLANA_CHAIN_ID } from "@/lib/lifi/tokens";
import type { YieldOpportunity } from "@/types/domain";

const KAMINO_PROGRAM_ID = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
const KAMINO_API_BASE = "https://api.kamino.finance";
const KAMINO_PROTOCOL_KEY = "kamino-lend";
const KAMINO_PROTOCOL_LABEL = "Kamino Lend";
const PRIMARY_MARKET_FALLBACK = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
const POPULAR_KAMINO_ASSETS = new Set([
  "SOL",
  "JitoSOL",
  "JITOSOL",
  "JupSOL",
  "mSOL",
  "MSOL",
  "bSOL",
  "bbSOL",
  "sSOL",
  "USDC",
  "USDT",
  "PYUSD",
  "ETH",
  "WBTC",
  "cbBTC",
  "JLP",
]);

type KaminoMarketSummary = {
  lendingMarket: string;
  isPrimary?: boolean;
};

type KaminoReserveMetric = {
  reserve: string;
  liquidityToken: string;
  liquidityTokenMint: string;
  supplyApy: string | number;
  totalSupplyUsd: string | number;
  totalBorrowUsd?: string | number;
};

function parseKaminoNumber(value: string | number | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchJson<T>(path: string) {
  const response = await fetch(`${KAMINO_API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "YieldPilot/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Kamino API request failed with ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

async function getPrimaryKaminoMarket() {
  const markets = await fetchJson<KaminoMarketSummary[]>(
    `/kamino-market?programId=${KAMINO_PROGRAM_ID}`,
  );

  return markets.find((market) => market.isPrimary)?.lendingMarket ?? markets[0]?.lendingMarket ?? PRIMARY_MARKET_FALLBACK;
}

export async function getKaminoLendOpportunities(): Promise<YieldOpportunity[]> {
  try {
    const market = await getPrimaryKaminoMarket();
    const reserves = await fetchJson<KaminoReserveMetric[]>(
      `/kamino-market/${market}/reserves/metrics?env=mainnet-beta`,
    );

    return reserves
      .filter((reserve) => POPULAR_KAMINO_ASSETS.has(reserve.liquidityToken))
      .map((reserve) => {
        const totalSupplyUsd = parseKaminoNumber(reserve.totalSupplyUsd);
        const totalBorrowUsd = parseKaminoNumber(reserve.totalBorrowUsd);
        const availableLiquidityUsd = Math.max(totalSupplyUsd - totalBorrowUsd, 0);
        const apy = parseKaminoNumber(reserve.supplyApy) * 100;

        return {
          id: `${LIFI_SOLANA_CHAIN_ID}:${reserve.liquidityTokenMint}:kamino`,
          protocol: KAMINO_PROTOCOL_KEY,
          protocolLabel: KAMINO_PROTOCOL_LABEL,
          chainId: LIFI_SOLANA_CHAIN_ID,
          chainKey: "solana",
          chainLabel: "Solana",
          assetSymbol: reserve.liquidityToken,
          assetAddress: reserve.liquidityTokenMint as `0x${string}`,
          apy,
          liquidityRate: String(reserve.supplyApy),
          availableLiquidityUsd,
          totalSupplyUsd,
          tvlUsd: totalSupplyUsd,
          reserveFactor: 0,
          priceUsd: 0,
          riskPenalty: 0.75,
          metadata: {
            market,
            reserve: reserve.reserve,
            sourceLabel: "Kamino Metrics API",
            executionSupported: false,
          },
        } satisfies YieldOpportunity;
      })
      .filter((opportunity) => opportunity.tvlUsd > 25_000 && opportunity.apy > 0)
      .sort((left, right) => right.apy - left.apy);
  } catch (error) {
    console.error("Failed to load Kamino reserve metrics.", error);
    return [];
  }
}
