import { scheduleLabel } from "@/lib/utils/time";
import type { DashboardPosition, DashboardSnapshot } from "@/types/domain";
import { env } from "@/lib/config/env";

type JupiterTokenInfo = {
  symbol?: string;
  name?: string;
  logoURI?: string;
};

type JupiterAsset = {
  value?: number;
  data?: {
    address?: string;
    amount?: number;
    price?: number;
  };
};

type JupiterElement = {
  type?: string;
  label?: string;
  name?: string;
  platformId?: string;
  data?: {
    apy?: number;
    assets?: JupiterAsset[];
  };
};

type JupiterPortfolioResponse = {
  elements?: JupiterElement[];
  tokenInfo?: Record<string, JupiterTokenInfo>;
};

function shortenMint(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function toDashboardPositions(params: {
  walletAddress: string;
  elements: JupiterElement[];
  tokenInfo: Record<string, JupiterTokenInfo>;
}): DashboardPosition[] {
  const positions: DashboardPosition[] = [];

  params.elements.forEach((element, elementIndex) => {
    const protocolLabel = element.name ?? element.label ?? element.platformId ?? "Wallet";
    const apy = Number(element.data?.apy ?? 0);

    element.data?.assets?.forEach((asset, assetIndex) => {
      const address = asset.data?.address;
      if (!address) {
        return;
      }

      const metadata = params.tokenInfo[address] ?? {};
      const balanceFormatted = Number(asset.data?.amount ?? 0);
      const balanceUsd = Number(asset.value ?? (asset.data?.amount ?? 0) * (asset.data?.price ?? 0));
      if (!Number.isFinite(balanceUsd) || balanceUsd <= 0) {
        return;
      }

      positions.push({
        id: `solana:${elementIndex}:${assetIndex}:${address}`,
        walletAddress: params.walletAddress,
        chainKey: "solana",
        chainLabel: "Solana",
        protocolLabel,
        assetSymbol: metadata.symbol ?? shortenMint(address),
        assetAddress: address,
        balanceFormatted,
        balanceUsd,
        apy,
        positionType: element.type ?? "wallet",
        metadata: {
          name: metadata.name,
          logoURI: metadata.logoURI,
          priceUsd: asset.data?.price,
        },
      });
    });
  });

  return positions.sort((left, right) => right.balanceUsd - left.balanceUsd);
}

export async function getLiveSolanaDashboardSnapshot(walletAddress: string): Promise<DashboardSnapshot> {
  const response = await fetch(`https://api.jup.ag/portfolio/v1/positions/${walletAddress}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Jupiter portfolio request failed with ${response.status}.`);
  }

  const payload = await response.json() as JupiterPortfolioResponse;
  const positions = toDashboardPositions({
    walletAddress,
    elements: payload.elements ?? [],
    tokenInfo: payload.tokenInfo ?? {},
  });

  const totalPortfolioUsd = positions.reduce((sum, position) => sum + position.balanceUsd, 0);
  const effectiveApy =
    totalPortfolioUsd === 0
      ? 0
      : positions.reduce((sum, position) => sum + position.balanceUsd * position.apy, 0) / totalPortfolioUsd;

  return {
    walletAddress,
    walletType: "solana",
    totalPortfolioUsd,
    effectiveApy,
    pendingApprovals: 0,
    autonomousModeEnabled: false,
    positions,
    opportunityCount: 0,
    currentAllocation: positions.map((position) => ({
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
