import { z } from "zod";

const defaultDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/yieldpilot?schema=public";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default(defaultDatabaseUrl),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_GENAI_MODEL: z.string().default("gemini-2.5-flash"),
  LIFI_INTEGRATOR: z.string().default("YieldPilot"),
  NEXT_PUBLIC_DEFAULT_WALLET_ADDRESS: z.string().optional(),
  AGENT_PRIVATE_KEY: z.string().optional(),
  ARBITRUM_RPC_URL: z.string().url().default("https://arb1.arbitrum.io/rpc"),
  BASE_RPC_URL: z.string().url().default("https://mainnet.base.org"),
  OPTIMISM_RPC_URL: z.string().url().default("https://mainnet.optimism.io"),
  AGENT_LOOP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  AGENT_HEALTHCHECK_TOKEN: z.string().optional(),
  WORKER_LEASE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  LIVE_EXECUTION_ENABLED: z.coerce.boolean().default(false),
  ENABLE_SMART_ACCOUNTS: z.coerce.boolean().default(false),
  ENABLE_GAS_SPONSORSHIP: z.coerce.boolean().default(false),
  ENABLE_EIP7702_EXPERIMENTAL: z.coerce.boolean().default(false),
  ERC4337_BUNDLER_RPC_URL: z.string().url().optional(),
  ERC4337_PAYMASTER_RPC_URL: z.string().url().optional(),
  SMART_ACCOUNT_FACTORY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_ARBITRUM_RPC_URL: z.string().url().default("https://arb1.arbitrum.io/rpc"),
  NEXT_PUBLIC_BASE_RPC_URL: z.string().url().default("https://mainnet.base.org"),
  NEXT_PUBLIC_OPTIMISM_RPC_URL: z.string().url().default("https://mainnet.optimism.io"),
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GOOGLE_GENAI_MODEL: process.env.GOOGLE_GENAI_MODEL,
  LIFI_INTEGRATOR: process.env.LIFI_INTEGRATOR,
  NEXT_PUBLIC_DEFAULT_WALLET_ADDRESS: process.env.NEXT_PUBLIC_DEFAULT_WALLET_ADDRESS,
  AGENT_PRIVATE_KEY: process.env.AGENT_PRIVATE_KEY,
  ARBITRUM_RPC_URL: process.env.ARBITRUM_RPC_URL,
  BASE_RPC_URL: process.env.BASE_RPC_URL,
  OPTIMISM_RPC_URL: process.env.OPTIMISM_RPC_URL,
  AGENT_LOOP_INTERVAL_MINUTES: process.env.AGENT_LOOP_INTERVAL_MINUTES,
  AGENT_HEALTHCHECK_TOKEN: process.env.AGENT_HEALTHCHECK_TOKEN,
  WORKER_LEASE_TTL_SECONDS: process.env.WORKER_LEASE_TTL_SECONDS,
  LIVE_EXECUTION_ENABLED: process.env.LIVE_EXECUTION_ENABLED,
  ENABLE_SMART_ACCOUNTS: process.env.ENABLE_SMART_ACCOUNTS,
  ENABLE_GAS_SPONSORSHIP: process.env.ENABLE_GAS_SPONSORSHIP,
  ENABLE_EIP7702_EXPERIMENTAL: process.env.ENABLE_EIP7702_EXPERIMENTAL,
  ERC4337_BUNDLER_RPC_URL: process.env.ERC4337_BUNDLER_RPC_URL,
  ERC4337_PAYMASTER_RPC_URL: process.env.ERC4337_PAYMASTER_RPC_URL,
  SMART_ACCOUNT_FACTORY_ADDRESS: process.env.SMART_ACCOUNT_FACTORY_ADDRESS,
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  NEXT_PUBLIC_ARBITRUM_RPC_URL: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL,
  NEXT_PUBLIC_BASE_RPC_URL: process.env.NEXT_PUBLIC_BASE_RPC_URL,
  NEXT_PUBLIC_OPTIMISM_RPC_URL: process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
});

export const hasGoogleAdkCredentials = Boolean(env.GOOGLE_API_KEY);
export const hasAgentWallet = Boolean(env.AGENT_PRIVATE_KEY);
export const hasSmartAccountConfig = Boolean(
  env.ENABLE_SMART_ACCOUNTS &&
    env.ERC4337_BUNDLER_RPC_URL &&
    env.ERC4337_PAYMASTER_RPC_URL &&
    env.SMART_ACCOUNT_FACTORY_ADDRESS &&
    env.AGENT_PRIVATE_KEY,
);
