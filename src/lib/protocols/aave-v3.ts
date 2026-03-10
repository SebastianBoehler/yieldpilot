import uiPoolDataProviderArtifact from "@aave/periphery-v3/artifacts/contracts/misc/interfaces/IUiPoolDataProviderV3.sol/IUiPoolDataProviderV3.json";
import poolArtifact from "@aave/core-v3/artifacts/contracts/interfaces/IPool.sol/IPool.json";
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from "viem";
import { createPublicClient, http } from "viem";
import type { PublicClient } from "viem";
import { CHAIN_CONFIGS, RAY, AAVE_PROTOCOL_KEY, AAVE_PROTOCOL_LABEL } from "@/lib/config/constants";
import type { ChainConfig, PortfolioPosition, TransactionPlanStep, YieldOpportunity } from "@/types/domain";
import { formatUnitsToNumber } from "@/lib/utils/number";

type ReserveData = {
  underlyingAsset: `0x${string}`;
  name: string;
  symbol: string;
  decimals: bigint;
  reserveFactor: bigint;
  isActive: boolean;
  isFrozen: boolean;
  liquidityIndex: bigint;
  liquidityRate: bigint;
  aTokenAddress: `0x${string}`;
  availableLiquidity: bigint;
  totalScaledVariableDebt: bigint;
  priceInMarketReferenceCurrency: bigint;
  borrowCap: bigint;
  supplyCap: bigint;
  eModeCategoryId: number;
  flashLoanEnabled: boolean;
};

type BaseCurrencyInfo = {
  marketReferenceCurrencyUnit: bigint;
  marketReferenceCurrencyPriceInUsd: bigint;
  networkBaseTokenPriceInUsd: bigint;
  networkBaseTokenPriceDecimals: number;
};

type UserReserveData = {
  underlyingAsset: `0x${string}`;
  scaledATokenBalance: bigint;
  usageAsCollateralEnabledOnUser: boolean;
  stableBorrowRate: bigint;
  scaledVariableDebt: bigint;
  principalStableDebt: bigint;
  stableBorrowLastUpdateTimestamp: bigint;
};

const CHAIN_BY_ID = new Map(CHAIN_CONFIGS.map((chain) => [chain.id, chain]));
const reserveCache = new Map<number, { at: number; data: YieldOpportunity[] }>();
const CACHE_TTL_MS = 30_000;

const isStableReserve = (symbol: string) => {
  const normalized = symbol.toUpperCase();
  return normalized.startsWith("USDC") || normalized.startsWith("USDT") || normalized.startsWith("DAI");
};

function getClient(chain: ChainConfig): PublicClient {
  return createPublicClient({
    chain: undefined,
    transport: http(chain.rpcUrl),
  });
}

function calculatePriceUsd(priceInReference: bigint, baseCurrencyInfo: BaseCurrencyInfo) {
  const referencePriceUsd = Number(baseCurrencyInfo.marketReferenceCurrencyPriceInUsd) / 10 ** 8;
  return (Number(priceInReference) / Number(baseCurrencyInfo.marketReferenceCurrencyUnit)) * referencePriceUsd;
}

function calculateTvlUsd(totalSupply: bigint, decimals: bigint, priceUsd: number) {
  return formatUnitsToNumber(totalSupply, Number(decimals)) * priceUsd;
}

function calculateApy(liquidityRate: bigint) {
  return (Number(liquidityRate) / Number(RAY)) * 100;
}

async function getChainReserveUniverse(chain: ChainConfig): Promise<YieldOpportunity[]> {
  const cached = reserveCache.get(chain.id);

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const publicClient = getClient(chain);
  const [reservesData, baseCurrencyInfo] = await publicClient.readContract({
    address: chain.uiPoolDataProvider,
    abi: uiPoolDataProviderArtifact.abi,
    functionName: "getReservesData",
    args: [chain.poolAddressesProvider],
  }) as [ReserveData[], BaseCurrencyInfo];

  const opportunities = reservesData
    .filter((reserve) => reserve.isActive && !reserve.isFrozen && isStableReserve(reserve.symbol))
    .map((reserve) => {
      const priceUsd = calculatePriceUsd(reserve.priceInMarketReferenceCurrency, baseCurrencyInfo);
      const totalSupply = reserve.availableLiquidity + reserve.totalScaledVariableDebt;
      const tvlUsd = calculateTvlUsd(totalSupply, reserve.decimals, priceUsd);
      const apy = calculateApy(reserve.liquidityRate);

      return {
        id: `${chain.id}:${reserve.underlyingAsset}`,
        protocol: AAVE_PROTOCOL_KEY,
        protocolLabel: AAVE_PROTOCOL_LABEL,
        chainId: chain.id,
        chainKey: chain.key,
        chainLabel: chain.label,
        assetSymbol: reserve.symbol,
        assetAddress: reserve.underlyingAsset,
        apy,
        liquidityRate: reserve.liquidityRate.toString(),
        availableLiquidityUsd: calculateTvlUsd(reserve.availableLiquidity, reserve.decimals, priceUsd),
        totalSupplyUsd: tvlUsd,
        tvlUsd,
        reserveFactor: Number(reserve.reserveFactor) / 100,
        priceUsd,
        riskPenalty: reserve.flashLoanEnabled ? 0.4 : 0.8,
        metadata: {
          borrowCap: reserve.borrowCap.toString(),
          supplyCap: reserve.supplyCap.toString(),
          liquidityIndex: reserve.liquidityIndex.toString(),
          aTokenAddress: reserve.aTokenAddress,
          poolAddress: chain.poolAddress,
          eModeCategoryId: reserve.eModeCategoryId,
        },
      } satisfies YieldOpportunity;
    });

  reserveCache.set(chain.id, {
    at: Date.now(),
    data: opportunities,
  });

  return opportunities;
}

export async function getAaveStableOpportunities(): Promise<YieldOpportunity[]> {
  const results = await Promise.all(
    CHAIN_CONFIGS.map(async (chain) => {
      try {
        return await getChainReserveUniverse(chain);
      } catch (error) {
        console.error(`Failed to load Aave reserve universe for ${chain.label}.`, error);
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
        const [reservesData, baseCurrencyInfo] = await publicClient.readContract({
          address: chain.uiPoolDataProvider,
          abi: uiPoolDataProviderArtifact.abi,
          functionName: "getReservesData",
          args: [chain.poolAddressesProvider],
        }) as [ReserveData[], BaseCurrencyInfo];

        const [userReserves] = await publicClient.readContract({
          address: chain.uiPoolDataProvider,
          abi: uiPoolDataProviderArtifact.abi,
          functionName: "getUserReservesData",
          args: [chain.poolAddressesProvider, walletAddress],
        }) as [UserReserveData[], number];

        const reserveByAsset = new Map(
          reservesData.map((reserve) => [reserve.underlyingAsset.toLowerCase(), reserve]),
        );

        const lendingPositions = userReserves
          .map((userReserve) => {
            const reserve = reserveByAsset.get(userReserve.underlyingAsset.toLowerCase());
            if (!reserve || !isStableReserve(reserve.symbol)) {
              return undefined;
            }

            const currentBalance = (userReserve.scaledATokenBalance * reserve.liquidityIndex) / RAY;
            if (currentBalance <= 0n) {
              return undefined;
            }

            const priceUsd = calculatePriceUsd(reserve.priceInMarketReferenceCurrency, baseCurrencyInfo);
            const apy = calculateApy(reserve.liquidityRate);

            return {
              id: `${chain.id}:${reserve.underlyingAsset}:aave`,
              walletAddress,
              chainId: chain.id,
              chainKey: chain.key,
              chainLabel: chain.label,
              protocol: AAVE_PROTOCOL_KEY,
              protocolLabel: AAVE_PROTOCOL_LABEL,
              assetSymbol: reserve.symbol,
              assetAddress: reserve.underlyingAsset,
              balance: currentBalance.toString(),
              balanceFormatted: formatUnitsToNumber(currentBalance, Number(reserve.decimals)),
              balanceUsd: formatUnitsToNumber(currentBalance, Number(reserve.decimals)) * priceUsd,
              apy,
              positionType: "lending",
              metadata: {
                liquidityIndex: reserve.liquidityIndex.toString(),
                priceUsd,
                aTokenAddress: reserve.aTokenAddress,
              },
            } satisfies PortfolioPosition;
          })
          .filter(Boolean) as PortfolioPosition[];

        const stableReserves = reservesData.filter((reserve) => isStableReserve(reserve.symbol));
        const idleBalances = await publicClient.multicall({
          allowFailure: true,
          contracts: stableReserves.map((reserve) => ({
            address: reserve.underlyingAsset,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress],
          })),
        });

        const idlePositions = stableReserves
          .map((reserve, index) => {
            const result = idleBalances[index];
            const balance = result.status === "success" ? BigInt(result.result as bigint) : 0n;
            if (result.status !== "success" || balance <= 0n) {
              return undefined;
            }

            const priceUsd = calculatePriceUsd(reserve.priceInMarketReferenceCurrency, baseCurrencyInfo);

            return {
              id: `${chain.id}:${reserve.underlyingAsset}:wallet`,
              walletAddress,
              chainId: chain.id,
              chainKey: chain.key,
              chainLabel: chain.label,
              protocol: "wallet",
              protocolLabel: "Wallet",
              assetSymbol: reserve.symbol,
              assetAddress: reserve.underlyingAsset,
              balance: balance.toString(),
              balanceFormatted: formatUnitsToNumber(balance, Number(reserve.decimals)),
              balanceUsd: formatUnitsToNumber(balance, Number(reserve.decimals)) * priceUsd,
              apy: 0,
              positionType: "idle",
              metadata: {
                priceUsd,
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
