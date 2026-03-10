import { scheduleLabel } from "@/lib/utils/time";
import type { DashboardPosition, DashboardSnapshot } from "@/types/domain";
import { env } from "@/lib/config/env";
import { getLifiTokenRefKey, LIFI_SOLANA_CHAIN_ID, resolveLifiTokenSymbols } from "@/lib/lifi/tokens";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const KNOWN_TOKEN_SYMBOLS: Record<string, string> = {
  [SOL_MINT]: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCER1X8D3Lr1RykWGBqBP3ZiZsa1onbX7mxy: "USDT",
  mSoLzYCxHdYgdzU5VnN4hTq8Q8Hf9A43wR8YDz6oK55: "mSOL",
  J1toso1uCkQYb5JwC4E5MkAqzZ4VHKs3P6KyHRxY6SY: "JitoSOL",
  bSo13r4TkiE4bW9hQw9u6JcYsEMF4iAfDdcQa1JiW6z: "bSOL",
};

type SolanaRpcResponse<T> = {
  result?: T;
  error?: {
    message?: string;
  };
};

type SolanaLamportBalance = {
  value: number;
};

type ParsedTokenAmount = {
  amount: string;
  decimals: number;
  uiAmount?: number | null;
  uiAmountString?: string;
};

type ParsedTokenAccount = {
  account: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: ParsedTokenAmount;
        };
      };
    };
  };
};

type ParsedTokenAccountsResult = {
  value?: ParsedTokenAccount[];
};

type JupiterPriceEntry = {
  usdPrice?: number;
};

function shortenMint(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function getSolanaRpcUrl() {
  return env.SOLANA_RPC_URL ?? env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

async function solanaRpcRequest<T>(method: string, params: unknown[]) {
  const response = await fetch(getSolanaRpcUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Solana RPC request failed with ${response.status}.`);
  }

  const payload = await response.json() as SolanaRpcResponse<T>;
  if (payload.error) {
    throw new Error(payload.error.message ?? `Solana RPC ${method} failed.`);
  }

  return payload.result as T;
}

async function getNativeSolBalance(walletAddress: string) {
  const result = await solanaRpcRequest<SolanaLamportBalance>("getBalance", [walletAddress]);
  return (result.value ?? 0) / 1_000_000_000;
}

async function getParsedTokenAccounts(walletAddress: string, programId: string) {
  const result = await solanaRpcRequest<ParsedTokenAccountsResult>("getTokenAccountsByOwner", [
    walletAddress,
    { programId },
    {
      encoding: "jsonParsed",
    },
  ]);

  return result.value ?? [];
}

async function getTokenPrices(mints: string[]) {
  if (!mints.length) {
    return new Map<string, number>();
  }

  const response = await fetch(`https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(mints.join(","))}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return new Map<string, number>();
  }

  const payload = await response.json() as Record<string, JupiterPriceEntry>;
  return new Map(
    Object.entries(payload).flatMap(([mint, entry]) => (
      typeof entry?.usdPrice === "number" && Number.isFinite(entry.usdPrice)
        ? [[mint, entry.usdPrice] as const]
        : []
    )),
  );
}

function toNumericAmount(tokenAmount?: ParsedTokenAmount) {
  if (!tokenAmount) {
    return 0;
  }

  if (typeof tokenAmount.uiAmount === "number" && Number.isFinite(tokenAmount.uiAmount)) {
    return tokenAmount.uiAmount;
  }

  if (tokenAmount.uiAmountString) {
    const parsed = Number(tokenAmount.uiAmountString);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const raw = Number(tokenAmount.amount ?? "0");
  return Number.isFinite(raw) ? raw / 10 ** tokenAmount.decimals : 0;
}

export async function getLiveSolanaDashboardSnapshot(walletAddress: string): Promise<DashboardSnapshot> {
  const [solBalance, tokenAccounts, token2022Accounts] = await Promise.all([
    getNativeSolBalance(walletAddress),
    getParsedTokenAccounts(walletAddress, TOKEN_PROGRAM),
    getParsedTokenAccounts(walletAddress, TOKEN_2022_PROGRAM).catch(() => []),
  ]);

  const balances = new Map<string, number>();

  if (solBalance > 0) {
    balances.set(SOL_MINT, solBalance);
  }

  [...tokenAccounts, ...token2022Accounts].forEach((entry) => {
    const mint = entry.account.data?.parsed?.info?.mint;
    const amount = toNumericAmount(entry.account.data?.parsed?.info?.tokenAmount);

    if (!mint || amount <= 0) {
      return;
    }

    balances.set(mint, (balances.get(mint) ?? 0) + amount);
  });

  const priceMap = await getTokenPrices(Array.from(balances.keys()));
  const lifiTokenSymbols = await resolveLifiTokenSymbols(
    Array.from(balances.keys())
      .filter((mint) => mint !== SOL_MINT)
      .map((mint) => ({
        chain: LIFI_SOLANA_CHAIN_ID,
        address: mint,
        fallbackSymbol: KNOWN_TOKEN_SYMBOLS[mint] ?? shortenMint(mint),
      })),
  );

  const positions: DashboardPosition[] = Array.from(balances.entries())
    .map(([mint, balanceFormatted]) => {
      const priceUsd = priceMap.get(mint) ?? 0;
      const balanceUsd = balanceFormatted * priceUsd;

      return {
        id: `solana:wallet:${mint}`,
        walletAddress,
        chainKey: "solana",
        chainLabel: "Solana",
        protocolLabel: "Wallet",
        assetSymbol:
          mint === SOL_MINT
            ? "SOL"
            : lifiTokenSymbols.get(getLifiTokenRefKey(LIFI_SOLANA_CHAIN_ID, mint)) ?? KNOWN_TOKEN_SYMBOLS[mint] ?? shortenMint(mint),
        assetAddress: mint,
        balanceFormatted,
        balanceUsd,
        apy: 0,
        positionType: "wallet",
        metadata: {
          priceUsd,
        },
      } satisfies DashboardPosition;
    })
    .sort((left, right) => right.balanceUsd - left.balanceUsd || right.balanceFormatted - left.balanceFormatted);

  const totalPortfolioUsd = positions.reduce((sum, position) => sum + position.balanceUsd, 0);

  return {
    walletAddress,
    walletType: "solana",
    totalPortfolioUsd,
    effectiveApy: 0,
    pendingApprovals: 0,
    autonomousModeEnabled: false,
    positions,
    opportunityCount: 0,
    currentAllocation: positions
      .filter((position) => position.balanceUsd > 0)
      .map((position) => ({
        label: `${position.assetSymbol} · ${position.protocolLabel}`,
        value: position.balanceUsd,
      })),
    byChain: [
      {
        label: "Solana",
        value: totalPortfolioUsd,
      },
    ],
    loopStatus: {
      scheduleLabel: scheduleLabel(env.AGENT_LOOP_INTERVAL_MINUTES),
    },
  };
}
