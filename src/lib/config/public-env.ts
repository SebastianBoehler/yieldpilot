export const publicEnv = {
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  arbitrumRpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL ?? "https://arb1.arbitrum.io/rpc",
  baseRpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org",
  optimismRpcUrl: process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL ?? "https://mainnet.optimism.io",
};
