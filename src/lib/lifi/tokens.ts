import { getToken } from "@lifi/sdk";
import { ensureLifiConfig } from "@/lib/lifi/client";

export const LIFI_SOLANA_CHAIN_ID = 1151111081099710;

type LifiTokenChain = number;

export type LifiTokenReference = {
  chain: LifiTokenChain;
  address: string;
  fallbackSymbol?: string;
};

type CachedTokenMetadata = {
  symbol: string;
};

const TOKEN_CACHE_TTL_MS = 10 * 60_000;
const tokenCache = new Map<string, { at: number; value: CachedTokenMetadata | null }>();

function normalizeAddress(address: string) {
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

export function getLifiTokenRefKey(chain: LifiTokenChain, address: string) {
  return `${String(chain)}:${normalizeAddress(address)}`;
}

async function fetchTokenMetadata(reference: LifiTokenReference) {
  ensureLifiConfig();

  const cacheKey = getLifiTokenRefKey(reference.chain, reference.address);
  const cached = tokenCache.get(cacheKey);

  if (cached && Date.now() - cached.at < TOKEN_CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const token = await getToken(reference.chain, reference.address);
    const value = {
      symbol: token.symbol,
    } satisfies CachedTokenMetadata;

    tokenCache.set(cacheKey, {
      at: Date.now(),
      value,
    });

    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`LI.FI token lookup failed for ${cacheKey}: ${message}`);

    tokenCache.set(cacheKey, {
      at: Date.now(),
      value: null,
    });

    return null;
  }
}

export async function resolveLifiTokenSymbols(references: LifiTokenReference[]) {
  const uniqueReferences = new Map<string, LifiTokenReference>();

  references.forEach((reference) => {
    uniqueReferences.set(getLifiTokenRefKey(reference.chain, reference.address), reference);
  });

  const resolvedEntries = await Promise.all(
    Array.from(uniqueReferences.entries()).map(async ([key, reference]) => {
      const metadata = await fetchTokenMetadata(reference);
      return [key, metadata?.symbol ?? reference.fallbackSymbol] as const;
    }),
  );

  return new Map(
    resolvedEntries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
}
