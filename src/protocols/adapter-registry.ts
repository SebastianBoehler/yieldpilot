import type { ProtocolAdapter } from "@/agent/types";
import { LifiProtocolAdapter } from "@/protocols/dex/lifi-adapter";
import { AaveProtocolAdapter } from "@/protocols/lending/aave-adapter";
import { UnsupportedProtocolAdapter } from "@/protocols/shared/unsupported-adapter";

const adapters = new Map<string, ProtocolAdapter>([
  ["lifi", new LifiProtocolAdapter()],
  ["aave-v3", new AaveProtocolAdapter()],
  [
    "perps",
    new UnsupportedProtocolAdapter(
      "perps",
      ["perp_open", "perp_close", "perp_reduce", "perp_add_collateral", "perp_remove_collateral"],
      "Perpetual market execution is scaffolded but not enabled in phase 1.",
    ),
  ],
  [
    "nft",
    new UnsupportedProtocolAdapter(
      "nft",
      ["nft_mint", "nft_buy", "nft_list", "nft_cancel"],
      "NFT execution is scaffolded but not enabled in phase 1.",
    ),
  ],
  [
    "yield-vault",
    new UnsupportedProtocolAdapter(
      "yield-vault",
      ["stake", "unstake", "claim_rewards", "yield_deposit", "yield_withdraw"],
      "Vault and staking execution beyond Aave is scaffolded but not enabled in phase 1.",
    ),
  ],
]);

export function getProtocolAdapter(protocol: string) {
  const adapter = adapters.get(protocol);
  if (!adapter) {
    throw new Error(`No protocol adapter registered for ${protocol}`);
  }

  return adapter;
}

export function listProtocolAdapters() {
  return Array.from(adapters.values());
}
