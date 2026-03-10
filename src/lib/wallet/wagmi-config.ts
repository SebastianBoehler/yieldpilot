import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { arbitrum, base, optimism } from "wagmi/chains";
import { publicEnv } from "@/lib/config/public-env";

const walletConnectConnector = publicEnv.walletConnectProjectId
  ? [walletConnect({ projectId: publicEnv.walletConnectProjectId, showQrModal: true })]
  : [];

export const walletConfig = createConfig({
  chains: [arbitrum, base, optimism],
  connectors: [
    injected(),
    ...walletConnectConnector,
  ],
  transports: {
    [arbitrum.id]: http(publicEnv.arbitrumRpcUrl),
    [base.id]: http(publicEnv.baseRpcUrl),
    [optimism.id]: http(publicEnv.optimismRpcUrl),
  },
});
