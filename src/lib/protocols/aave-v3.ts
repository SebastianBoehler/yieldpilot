import aaveOracleArtifact from "@aave/core-v3/artifacts/contracts/interfaces/IAaveOracle.sol/IAaveOracle.json";
import protocolDataProviderArtifact from "@aave/core-v3/artifacts/contracts/misc/AaveProtocolDataProvider.sol/AaveProtocolDataProvider.json";
import poolArtifact from "@aave/core-v3/artifacts/contracts/interfaces/IPool.sol/IPool.json";
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from "viem";
import { createPublicClient, http } from "viem";
import type { PublicClient } from "viem";
import { CHAIN_CONFIGS, RAY, AAVE_PROTOCOL_KEY, AAVE_PROTOCOL_LABEL, USD_PRICE_DECIMALS } from "@/lib/config/constants";
import type { ChainConfig, PortfolioPosition, TransactionPlanStep, YieldOpportunity } from "@/types/domain";
import { formatUnitsToNumber } from "@/lib/utils/number";

type ReserveConfigurationData = [
  decimals: bigint,
  ltv: bigint,
  liquidationThreshold: bigint,
  liquidationBonus: bigint,
  reserveFactor: bigint,
  usageAsCollateralEnabled: boolean,
  borrowingEnabled: boolean,
  stableBorrowRateEnabled: boolean,
  isActive: boolean,
  isFrozen: boolean,
];

type ReserveDataView = {
  assetAddress: `0x${string}`;
  symbol: string;
  decimals: number;
  reserveFactor: number;
  isActive: boolean;
  isFrozen: boolean;
  liquidityIndex: bigint;
  liquidityRate: bigint;
  aTokenAddress?: `0x${string}`;
  variableDebtTokenAddress?: `0x${string}`;
  availableLiquidity: bigint;
  totalAToken: bigint;
  totalVariableDebt: bigint;
  totalStableDebt: bigint;
  totalSupplyUsd: number;
  availableLiquidityUsd: number;
  tvlUsd: number;
  priceUsd: number;
};

type UserReserveData = [
  currentATokenBalance: bigint,
  currentStableDebt: bigint,
  currentVariableDebt: bigint,
  principalStableDebt: bigint,
  scaledVariableDebt: bigint,
  stableBorrowRate: bigint,
  liquidityRate: bigint,
  stableRateLastUpdated: number,
  usageAsCollateralEnabled: boolean,
];

const CHAIN_BY_ID = new Map(CHAIN_CONFIGS.map((chain) => [chain.id, chain]));
const reserveCache = new Map<string, { at: number; data: YieldOpportunity[] }>();
const CACHE_TTL_MS = 30_000;

function getClient(chain: ChainConfig): PublicClient {
  return createPublicClient({
    chain: undefined,
    transport: http(chain.rpcUrl),
  });
}

function calculatePriceUsd(price: bigint) {
  return Number(price) / 10 ** USD_PRICE_DECIMALS;
}

function calculateApy(liquidityRate: bigint) {
  return (Number(liquidityRate) / Number(RAY)) * 100;
}

function calculateUsdBalance(amount: bigint, decimals: number, priceUsd: number) {
  return formatUnitsToNumber(amount, decimals) * priceUsd;
}

async function loadChainReserves(
  chain: ChainConfig,
  assetMap: Record<string, `0x${string}`> = chain.assets,
): Promise<ReserveDataView[]> {
  const publicClient = getClient(chain);
  const assets = Object.entries(assetMap) as Array<[string, `0x${string}`]>;
  const reserveViews: ReserveDataView[] = [];

  for (const [assetSymbol, assetAddress] of assets) {
    try {
      const [reserveConfiguration, reserveData, assetPrice] = await Promise.all([
        publicClient.readContract({
          address: chain.protocolDataProvider,
          abi: protocolDataProviderArtifact.abi,
          functionName: "getReserveConfigurationData",
          args: [assetAddress],
        }) as Promise<ReserveConfigurationData>,
        publicClient.readContract({
          address: chain.protocolDataProvider,
          abi: protocolDataProviderArtifact.abi,
          functionName: "getReserveData",
          args: [assetAddress],
        }) as Promise<[bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, number]>,
        publicClient.readContract({
          address: chain.oracleAddress,
          abi: aaveOracleArtifact.abi,
          functionName: "getAssetPrice",
          args: [assetAddress],
        }) as Promise<bigint>,
      ]);

      const [
        reserveDecimals,
        ,
        ,
        ,
        reserveFactor,
        ,
        ,
        ,
        isActive,
        isFrozen,
      ] = reserveConfiguration;

      const [
        unbacked,
        ,
        totalAToken,
        totalStableDebt,
        totalVariableDebt,
        liquidityRate,
        ,
        ,
        ,
        liquidityIndex,
      ] = reserveData;

      const availableLiquidity = totalAToken > totalStableDebt + totalVariableDebt + unbacked
        ? totalAToken - totalStableDebt - totalVariableDebt - unbacked
        : 0n;
      const priceUsd = calculatePriceUsd(assetPrice);
      const normalizedDecimals = Number(reserveDecimals);
      const totalSupplyUsd = calculateUsdBalance(totalAToken, normalizedDecimals, priceUsd);
      const availableLiquidityUsd = calculateUsdBalance(availableLiquidity, normalizedDecimals, priceUsd);

      const reserveView = {
        assetAddress,
        symbol: assetSymbol,
        decimals: normalizedDecimals,
        reserveFactor: Number(reserveFactor) / 100,
        isActive,
        isFrozen,
        liquidityIndex,
        liquidityRate,
        availableLiquidity,
        totalAToken,
        totalVariableDebt,
        totalStableDebt,
        totalSupplyUsd,
        availableLiquidityUsd,
        tvlUsd: totalSupplyUsd,
        priceUsd,
      } satisfies ReserveDataView;

      reserveViews.push(reserveView);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to load reserve ${assetSymbol} on ${chain.label}: ${message}`);
    }
  }

  return reserveViews.filter((reserve) => reserve.isActive && !reserve.isFrozen);
}

async function getChainReserveUniverse(
  chain: ChainConfig,
  assetMap: Record<string, `0x${string}`> = chain.assets,
  cacheKeySuffix = "stable",
): Promise<YieldOpportunity[]> {
  const cacheKey = `${chain.id}:${cacheKeySuffix}`;
  const cached = reserveCache.get(cacheKey);

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const reservesData = await loadChainReserves(chain, assetMap);

  const opportunities = reservesData
    .map((reserve) => {
      const apy = calculateApy(reserve.liquidityRate);

      return {
        id: `${chain.id}:${reserve.assetAddress}`,
        protocol: AAVE_PROTOCOL_KEY,
        protocolLabel: AAVE_PROTOCOL_LABEL,
        chainId: chain.id,
        chainKey: chain.key,
        chainLabel: chain.label,
        assetSymbol: reserve.symbol,
        assetAddress: reserve.assetAddress,
        apy,
        liquidityRate: reserve.liquidityRate.toString(),
        availableLiquidityUsd: reserve.availableLiquidityUsd,
        totalSupplyUsd: reserve.totalSupplyUsd,
        tvlUsd: reserve.tvlUsd,
        reserveFactor: reserve.reserveFactor,
        priceUsd: reserve.priceUsd,
        riskPenalty: 0.4,
        metadata: {
          liquidityIndex: reserve.liquidityIndex.toString(),
          aTokenAddress: reserve.aTokenAddress,
          poolAddress: chain.poolAddress,
          variableDebtTokenAddress: reserve.variableDebtTokenAddress,
          sourceLabel: "Aave RPC",
          executionSupported: true,
        },
      } satisfies YieldOpportunity;
    });

  reserveCache.set(cacheKey, {
    at: Date.now(),
    data: opportunities,
  });

  return opportunities;
}

export async function getAaveStableOpportunities(): Promise<YieldOpportunity[]> {
  const results = await Promise.all(
    CHAIN_CONFIGS.map(async (chain) => {
      try {
        return await getChainReserveUniverse(chain, chain.assets, "stable");
      } catch (error) {
        console.error(`Failed to load Aave reserve universe for ${chain.label}.`, error);
        return [];
      }
    }),
  );

  return results.flat().sort((left, right) => right.apy - left.apy);
}

export async function getAaveDiscoveryOpportunities(): Promise<YieldOpportunity[]> {
  const results = await Promise.all(
    CHAIN_CONFIGS.map(async (chain) => {
      try {
        return await getChainReserveUniverse(chain, chain.discoveryAssets, "discovery");
      } catch (error) {
        console.error(`Failed to load Aave discovery markets for ${chain.label}.`, error);
        return [];
      }
    }),
  );

  return results.flat().sort((left, right) => right.apy - left.apy);
}

export async function getAaveStablePositions(walletAddress: `0x${string}`): Promise<PortfolioPosition[]> {
  const positions = await Promise.all(
    CHAIN_CONFIGS.map(async (chain) => {
      try {
        const publicClient = getClient(chain);
        const reservesData = await loadChainReserves(chain);

        const lendingPositions = (
          await Promise.all(
            reservesData.map(async (reserve) => {
              const userReserve = await publicClient.readContract({
                address: chain.protocolDataProvider,
                abi: protocolDataProviderArtifact.abi,
                functionName: "getUserReserveData",
                args: [reserve.assetAddress, walletAddress],
              }) as UserReserveData;

              const currentBalance = userReserve[0];
              if (currentBalance <= 0n) {
                return undefined;
              }

              const apy = calculateApy(BigInt(userReserve[6] ?? reserve.liquidityRate));

              return {
                id: `${chain.id}:${reserve.assetAddress}:aave`,
                walletAddress,
                chainId: chain.id,
                chainKey: chain.key,
                chainLabel: chain.label,
                protocol: AAVE_PROTOCOL_KEY,
                protocolLabel: AAVE_PROTOCOL_LABEL,
                assetSymbol: reserve.symbol,
                assetAddress: reserve.assetAddress,
                balance: currentBalance.toString(),
                balanceFormatted: formatUnitsToNumber(currentBalance, reserve.decimals),
                balanceUsd: formatUnitsToNumber(currentBalance, reserve.decimals) * reserve.priceUsd,
                apy,
                positionType: "lending",
                metadata: {
                  liquidityIndex: reserve.liquidityIndex.toString(),
                  priceUsd: reserve.priceUsd,
                  aTokenAddress: reserve.aTokenAddress,
                },
              } satisfies PortfolioPosition;
            }),
          )
        ).filter(Boolean) as PortfolioPosition[];

        const idleBalances = await publicClient.multicall({
          allowFailure: true,
          contracts: reservesData.map((reserve) => ({
            address: reserve.assetAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress],
          })),
        });

        const idlePositions = reservesData
          .map((reserve, index) => {
            const result = idleBalances[index];
            const balance = result.status === "success" ? BigInt(result.result as bigint) : 0n;
            if (result.status !== "success" || balance <= 0n) {
              return undefined;
            }

            return {
              id: `${chain.id}:${reserve.assetAddress}:wallet`,
              walletAddress,
              chainId: chain.id,
              chainKey: chain.key,
              chainLabel: chain.label,
              protocol: "wallet",
              protocolLabel: "Wallet",
              assetSymbol: reserve.symbol,
              assetAddress: reserve.assetAddress,
              balance: balance.toString(),
              balanceFormatted: formatUnitsToNumber(balance, reserve.decimals),
              balanceUsd: formatUnitsToNumber(balance, reserve.decimals) * reserve.priceUsd,
              apy: 0,
              positionType: "idle",
              metadata: {
                priceUsd: reserve.priceUsd,
              },
            } satisfies PortfolioPosition;
          })
          .filter(Boolean) as PortfolioPosition[];

        return [...lendingPositions, ...idlePositions];
      } catch (error) {
        console.error(`Failed to load Aave positions for ${chain.label}.`, error);
        return [];
      }
    }),
  );

  return positions.flat().sort((left, right) => right.balanceUsd - left.balanceUsd);
}

export function buildAaveDepositStep({
  chainId,
  assetAddress,
  amount,
  walletAddress,
  assetSymbol,
}: {
  chainId: number;
  assetAddress: `0x${string}`;
  amount: bigint;
  walletAddress: `0x${string}`;
  assetSymbol: string;
}): TransactionPlanStep {
  const chain = CHAIN_BY_ID.get(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ${chainId}`);
  }

  return {
    stepKey: `deposit-${chainId}-${assetAddress}`,
    title: `Deposit ${assetSymbol} into ${AAVE_PROTOCOL_LABEL}`,
    transactionType: "deposit",
    chainId,
    to: chain.poolAddress,
    data: encodeFunctionData({
      abi: poolArtifact.abi,
      functionName: "supply",
      args: [assetAddress, amount, walletAddress, 0],
    }),
    value: "0",
    description: `Supply bridged capital into ${AAVE_PROTOCOL_LABEL} on ${chain.label}.`,
    protocol: AAVE_PROTOCOL_LABEL,
    assetSymbol,
    metadata: {
      assetAddress,
      onBehalfOf: walletAddress,
    },
  };
}

export function buildAaveWithdrawStep({
  chainId,
  assetAddress,
  amount,
  walletAddress,
  assetSymbol,
}: {
  chainId: number;
  assetAddress: `0x${string}`;
  amount: bigint;
  walletAddress: `0x${string}`;
  assetSymbol: string;
}): TransactionPlanStep {
  const chain = CHAIN_BY_ID.get(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ${chainId}`);
  }

  return {
    stepKey: `withdraw-${chainId}-${assetAddress}`,
    title: `Withdraw ${assetSymbol} from ${AAVE_PROTOCOL_LABEL}`,
    transactionType: "withdraw",
    chainId,
    to: chain.poolAddress,
    data: encodeFunctionData({
      abi: poolArtifact.abi,
      functionName: "withdraw",
      args: [assetAddress, amount, walletAddress],
    }),
    value: "0",
    description: `Exit the current lending position on ${chain.label}.`,
    protocol: AAVE_PROTOCOL_LABEL,
    assetSymbol,
    metadata: {
      assetAddress,
      to: walletAddress,
    },
  };
}

export async function estimateGasUsdForStep(step: TransactionPlanStep, from: `0x${string}`) {
  const chain = CHAIN_BY_ID.get(step.chainId);
  if (!chain || !step.data) {
    return undefined;
  }

  const publicClient = getClient(chain);
  const gas = await publicClient.estimateGas({
    account: from,
    to: step.to,
    data: step.data,
    value: step.value ? BigInt(step.value) : 0n,
  });

  const gasPrice = await publicClient.getGasPrice();
  const nativeUsd = 2500;
  const gasCostNative = Number(formatUnits(gas * gasPrice, 18));

  return gasCostNative * nativeUsd;
}

export function amountToAtomic(amount: number, decimals: number) {
  return parseUnits(amount.toFixed(Math.min(decimals, 6)), decimals);
}
