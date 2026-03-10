import { createConfig, EVM } from "@lifi/sdk";
import { env } from "@/lib/config/env";

let initialized = false;

export function ensureLifiConfig() {
  if (initialized) {
    return;
  }

  createConfig({
    integrator: env.LIFI_INTEGRATOR,
    preloadChains: true,
    providers: [EVM()],
  });

  initialized = true;
}
