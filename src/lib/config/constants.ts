import { AaveV3Arbitrum, AaveV3Base, AaveV3Optimism } from "@aave-dao/aave-address-book";
import { env } from "@/lib/config/env";
import type { ChainConfig, SupportedAssetKey } from "@/types/domain";

export const SUPPORTED_STABLES: SupportedAssetKey[] = ["USDC", "USDT", "DAI"];
export const AAVE_PROTOCOL_KEY = "aave-v3";
export const AAVE_PROTOCOL_LABEL = "Aave V3";
export const RAY = 10n ** 27n;
export const USD_PRICE_DECIMALS = 8;
export const MARKET_REFERENCE_DECIMALS = 8;
export const HOLDING_PERIOD_DAYS = 30;

export const CHAIN_CONFIGS: ChainConfig[] = [
  {
    id: 42161,
    key: "arbitrum",
    label: "Arbitrum",
    rpcUrl: env.ARBITRUM_RPC_URL,
    nativeSymbol: "ETH",
    blockExplorer: "https://arbiscan.io",
    poolAddress: AaveV3Arbitrum.POOL,
    poolAddressesProvider: AaveV3Arbitrum.POOL_ADDRESSES_PROVIDER,
    protocolDataProvider: AaveV3Arbitrum.AAVE_PROTOCOL_DATA_PROVIDER,
    uiPoolDataProvider: AaveV3Arbitrum.UI_POOL_DATA_PROVIDER,
    assets: {
      USDC: AaveV3Arbitrum.ASSETS.USDC.UNDERLYING,
      USDT: AaveV3Arbitrum.ASSETS.USDT.UNDERLYING,
      DAI: AaveV3Arbitrum.ASSETS.DAI.UNDERLYING,
    },
  },
  {
    id: 8453,
    key: "base",
    label: "Base",
    rpcUrl: env.BASE_RPC_URL,
    nativeSymbol: "ETH",
    blockExplorer: "https://basescan.org",
    poolAddress: AaveV3Base.POOL,
    poolAddressesProvider: AaveV3Base.POOL_ADDRESSES_PROVIDER,
    protocolDataProvider: AaveV3Base.AAVE_PROTOCOL_DATA_PROVIDER,
    uiPoolDataProvider: AaveV3Base.UI_POOL_DATA_PROVIDER,
    assets: {
      USDC: AaveV3Base.ASSETS.USDC.UNDERLYING,
    },
  },
  {
    id: 10,
    key: "optimism",
    label: "Optimism",
    rpcUrl: env.OPTIMISM_RPC_URL,
    nativeSymbol: "ETH",
    blockExplorer: "https://optimistic.etherscan.io",
    poolAddress: AaveV3Optimism.POOL,
    poolAddressesProvider: AaveV3Optimism.POOL_ADDRESSES_PROVIDER,
    protocolDataProvider: AaveV3Optimism.AAVE_PROTOCOL_DATA_PROVIDER,
    uiPoolDataProvider: AaveV3Optimism.UI_POOL_DATA_PROVIDER,
    assets: {
      USDC: AaveV3Optimism.ASSETS.USDC.UNDERLYING,
      USDT: AaveV3Optimism.ASSETS.USDT.UNDERLYING,
      DAI: AaveV3Optimism.ASSETS.DAI.UNDERLYING,
    },
  },
];

export const CHAIN_BY_ID = new Map(CHAIN_CONFIGS.map((chain) => [chain.id, chain]));
export const CHAIN_BY_KEY = new Map(CHAIN_CONFIGS.map((chain) => [chain.key, chain]));
