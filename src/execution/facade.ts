import { PimlicoGasSponsorProvider } from "@/gas/provider";
import { createWalletExecutionProviders } from "@/wallet/providers";
import type { ActionExecutionBundle, ActionExecutionResult, AgentActionRequest, RiskPolicy } from "@/agent/types";

function selectBundleMode(policy: RiskPolicy): ActionExecutionBundle["mode"] {
  if (policy.enableSmartAccounts) {
    return "erc4337";
  }

  return "eoa";
}

export async function executeActionBundle(params: {
  request: AgentActionRequest;
  bundle: Omit<ActionExecutionBundle, "mode" | "sponsorship">;
  policy: RiskPolicy;
}) {
  const sponsorProvider = new PimlicoGasSponsorProvider();
  const providers = createWalletExecutionProviders();
  const preferredMode = selectBundleMode(params.policy);
  const provider = providers.find((entry) => entry.mode === preferredMode) ?? providers[providers.length - 1];

  const provisionalBundle: ActionExecutionBundle = {
    ...params.bundle,
    mode: provider.mode,
    sponsorship: {
      eligible: false,
      sponsored: false,
      mode: "none",
      metadata: {},
    },
  };

  const sponsorship = await sponsorProvider.sponsor(provisionalBundle, params.request);
  const bundle = {
    ...provisionalBundle,
    sponsorship,
  } satisfies ActionExecutionBundle;

  const capability = provider.canExecute(bundle);
  if (!capability.supported) {
    const fallbackProvider = providers.find((entry) => entry.mode === "eoa");

    if (!fallbackProvider || !fallbackProvider.isAvailable()) {
      return {
        execution: {
          status: "UNSUPPORTED",
          bundleMode: bundle.mode,
          sponsorship,
          error: capability.reason,
          metadata: {
            provider: provider.mode,
          },
        } satisfies ActionExecutionResult,
        providerMode: provider.mode,
        stepResults: [],
      };
    }

    const executableFallbackProvider = fallbackProvider;
    const fallbackBundle: ActionExecutionBundle = {
      ...bundle,
      mode: "eoa",
      sponsorship: {
        ...sponsorship,
        sponsored: false,
        mode: sponsorship.eligible ? "fallback" : sponsorship.mode,
        reason: capability.reason ?? sponsorship.reason,
      },
    };
    const stepResults = await executableFallbackProvider.execute(fallbackBundle);
    const failed = stepResults.find((result) => result.status !== "CONFIRMED");
    const transactionHash = stepResults.at(-1)?.hash;

    return {
      execution: {
        status: failed ? "FAILED" : "CONFIRMED",
        bundleMode: fallbackBundle.mode,
        sponsorship: fallbackBundle.sponsorship,
        transactionHash,
        explorerUrl: stepResults.at(-1)?.explorerUrl,
          error: failed?.error,
          metadata: {
            provider: executableFallbackProvider.mode,
            stepResults,
          },
        } satisfies ActionExecutionResult,
        providerMode: executableFallbackProvider.mode,
        stepResults,
      };
  }

  const stepResults = await provider.execute(bundle);
  const failed = stepResults.find((result) => result.status !== "CONFIRMED");
  const transactionHash = stepResults.at(-1)?.hash;

  return {
    execution: {
      status: failed ? "FAILED" : "CONFIRMED",
      bundleMode: bundle.mode,
      sponsorship,
      transactionHash,
      explorerUrl: stepResults.at(-1)?.explorerUrl,
      error: failed?.error,
      metadata: {
        provider: provider.mode,
        stepResults,
      },
    } satisfies ActionExecutionResult,
    providerMode: provider.mode,
    stepResults,
  };
}
