import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { arbitrum, base, optimism } from "wagmi/chains";
import { publicEnv } from "@/lib/config/public-env";

const walletConnectConnector = publicEnv.walletConnectProjectId
  ? [walletConnect({ projectId: publicEnv.walletConnectProjectId, showQrModal: true })]
  : [];

export const walletConfig = createConfig({
  multiInjectedProviderDiscovery: false,
  chains: [arbitrum, base, optimism],
  connectors: [
    injected({ target: "metaMask" }),
    ...walletConnectConnector,
  ],
  transports: {
    [arbitrum.id]: http(publicEnv.arbitrumRpcUrl),
    [base.id]: http(publicEnv.baseRpcUrl),
    [optimism.id]: http(publicEnv.optimismRpcUrl),
  },
});
