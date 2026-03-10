import type { Route } from "@lifi/types";
import { buildLifiBridgeStep, getBestRouteQuote } from "@/lib/lifi/quotes";
import { checkTokenAllowance, prepareApprovalTransaction } from "@/lib/wallet/signing-service";
import type {
  ActionExecutionBundle,
  ActionQuote,
  ActionSimulation,
  ActionStatusResult,
  ActionValidation,
  AgentActionRequest,
  ProtocolAdapter,
  ProtocolAdapterCapabilities,
} from "@/agent/types";

function getRouteFromMetadata(request: AgentActionRequest) {
  const route = request.metadata.route;
  return route && typeof route === "object" ? (route as Route) : undefined;
}

async function resolveRoute(request: AgentActionRequest) {
  const existingRoute = getRouteFromMetadata(request);
  if (existingRoute) {
    return existingRoute;
  }

  const fromTokenAddress = request.metadata.fromTokenAddress as `0x${string}` | undefined;
  const toTokenAddress = request.metadata.toTokenAddress as `0x${string}` | undefined;
  const fromAmount = request.metadata.fromAmount as string | undefined;
  const toChainId = request.metadata.toChainId as number | undefined;

  if (!fromTokenAddress || !toTokenAddress || !fromAmount || !toChainId) {
    throw new Error("LI.FI actions require route metadata or explicit token and chain inputs.");
  }

  const { route } = await getBestRouteQuote({
    fromChainId: request.chainId,
    toChainId,
    fromTokenAddress,
    toTokenAddress,
    fromAmount,
    fromAddress: request.accountAddress,
    toAddress: request.receiver ?? request.accountAddress,
    slippage: request.slippageBps ?? 30,
  });

  return route;
}

export class LifiProtocolAdapter implements ProtocolAdapter {
  readonly protocol = "lifi";

  getCapabilities(): ProtocolAdapterCapabilities {
    return {
      protocol: this.protocol,
      supportedActions: ["swap", "bridge_swap"],
      simulation: true,
      liveExecution: true,
      gasSponsorship: true,
      smartAccounts: true,
      eip7702: false,
      permits: false,
      notes: [
        "Gas can be sponsored only when the wallet provider supports the route bundle.",
        "Swap fees, bridge fees, and slippage are never gas-sponsored.",
      ],
    };
  }

  async quoteAction(request: AgentActionRequest): Promise<ActionQuote> {
    const route = await resolveRoute(request);
    const firstStep = route.steps[0];

    return {
      request,
      amountUsd: request.amountUsd,
      expectedOutputAmount: route.toAmountMin,
      estimatedFeeUsd: firstStep.estimate.feeCosts?.reduce((sum, item) => sum + Number(item.amountUSD ?? 0), 0) ?? 0,
      estimatedGasUsd: firstStep.estimate.gasCosts?.reduce((sum, item) => sum + Number(item.amountUSD ?? 0), 0) ?? 0,
      routeId: route.id,
      routeSummary: `${firstStep.toolDetails.name} ${route.fromChainId} -> ${route.toChainId}`,
      metadata: {
        route,
      },
    };
  }

  async validateAction(request: AgentActionRequest): Promise<ActionValidation> {
    const route = await resolveRoute(request);

    return {
      valid: Boolean(route.steps.length),
      requiresApproval: Boolean(route.steps[0]?.estimate.approvalAddress),
      reasons: route.steps.length ? [] : ["LI.FI did not return a route."],
      metadata: {
        routeId: route.id,
      },
    };
  }

  async simulateAction(request: AgentActionRequest): Promise<ActionSimulation> {
    const quote = await this.quoteAction(request);

    return {
      simulated: true,
      success: true,
      warnings: [],
      metadata: quote.metadata,
    };
  }

  async executeAction(request: AgentActionRequest): Promise<ActionExecutionBundle> {
    const route = await resolveRoute(request);
    const txSteps = [];
    const approvalAddress = route.steps[0]?.estimate.approvalAddress as `0x${string}` | undefined;
    const fromTokenAddress = route.fromToken.address as `0x${string}`;
    const fromAmount = BigInt(request.metadata.fromAmount as string ?? request.amount ?? "0");

    if (approvalAddress) {
      const allowance = await checkTokenAllowance({
        chainId: route.fromChainId,
        tokenAddress: fromTokenAddress,
        owner: request.accountAddress,
        spender: approvalAddress,
      });

      if (allowance < fromAmount) {
        txSteps.push(
          await prepareApprovalTransaction({
            chainId: route.fromChainId,
            tokenAddress: fromTokenAddress,
            spender: approvalAddress,
            amount: fromAmount,
            assetSymbol: route.fromToken.symbol,
          }),
        );
      }
    }

    txSteps.push(await buildLifiBridgeStep(route));

    return {
      mode: "eoa",
      routeTool: route.steps[0]?.tool ?? "lifi",
      txSteps: txSteps.map((step) => ({
        ...step,
        metadata: {
          ...step.metadata,
          toChainId: route.toChainId,
        },
      })),
      sponsorship: {
        eligible: false,
        sponsored: false,
        mode: "none",
        metadata: {},
      },
      metadata: {
        routeId: route.id,
        route,
      },
    };
  }

  async getActionStatus(_request: AgentActionRequest, transactionHash?: string): Promise<ActionStatusResult> {
    return {
      status: transactionHash ? "pending" : "unsupported",
      message: transactionHash ? "Bridge or swap submitted." : "No transaction hash recorded.",
      metadata: {},
    };
  }
}
