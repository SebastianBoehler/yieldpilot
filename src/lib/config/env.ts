import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_GENAI_MODEL: z.string().default("gemini-2.5-flash"),
  LIFI_INTEGRATOR: z.string().default("YieldPilot"),
  NEXT_PUBLIC_DEFAULT_WALLET_ADDRESS: z.string().optional(),
  AGENT_PRIVATE_KEY: z.string().optional(),
  ARBITRUM_RPC_URL: z.string().url().default("https://arb1.arbitrum.io/rpc"),
  BASE_RPC_URL: z.string().url().default("https://mainnet.base.org"),
  OPTIMISM_RPC_URL: z.string().url().default("https://mainnet.optimism.io"),
  AGENT_LOOP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GOOGLE_GENAI_MODEL: process.env.GOOGLE_GENAI_MODEL,
  LIFI_INTEGRATOR: process.env.LIFI_INTEGRATOR,
  NEXT_PUBLIC_DEFAULT_WALLET_ADDRESS: process.env.NEXT_PUBLIC_DEFAULT_WALLET_ADDRESS,
  AGENT_PRIVATE_KEY: process.env.AGENT_PRIVATE_KEY,
  ARBITRUM_RPC_URL: process.env.ARBITRUM_RPC_URL,
  BASE_RPC_URL: process.env.BASE_RPC_URL,
  OPTIMISM_RPC_URL: process.env.OPTIMISM_RPC_URL,
  AGENT_LOOP_INTERVAL_MINUTES: process.env.AGENT_LOOP_INTERVAL_MINUTES,
});

export const hasGoogleAdkCredentials = Boolean(env.GOOGLE_API_KEY);
export const hasAgentWallet = Boolean(env.AGENT_PRIVATE_KEY);
