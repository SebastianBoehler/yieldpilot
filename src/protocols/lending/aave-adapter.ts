import {
  buildAaveBorrowStep,
  buildAaveDepositStep,
  buildAaveRepayStep,
  buildAaveWithdrawStep,
  estimateGasUsdForStep,
} from "@/lib/protocols/aave-v3";
import { CHAIN_BY_ID } from "@/lib/config/constants";
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

function getAssetAddress(request: AgentActionRequest) {
  const assetAddress = request.metadata.assetAddress;
  if (typeof assetAddress !== "string") {
    throw new Error("Aave actions require metadata.assetAddress.");
  }

  return assetAddress as `0x${string}`;
}

function getAtomicAmount(request: AgentActionRequest) {
  const raw = request.metadata.atomicAmount ?? request.amount;
  if (typeof raw !== "string") {
    throw new Error("Aave actions require an atomic amount string.");
  }

  return BigInt(raw);
}

function getCoreStep(request: AgentActionRequest) {
  const assetAddress = getAssetAddress(request);
  const amount = getAtomicAmount(request);

  switch (request.kind) {
    case "lend_deposit":
    case "yield_deposit":
      return buildAaveDepositStep({
        chainId: request.chainId,
        assetAddress,
        amount,
        walletAddress: request.accountAddress,
        assetSymbol: request.assetSymbol ?? "TOKEN",
      });
    case "lend_withdraw":
    case "yield_withdraw":
      return buildAaveWithdrawStep({
        chainId: request.chainId,
        assetAddress,
        amount,
        walletAddress: request.accountAddress,
        assetSymbol: request.assetSymbol ?? "TOKEN",
      });
    case "borrow":
      return buildAaveBorrowStep({
        chainId: request.chainId,
        assetAddress,
        amount,
        walletAddress: request.accountAddress,
        assetSymbol: request.assetSymbol ?? "TOKEN",
      });
    case "repay":
      return buildAaveRepayStep({
        chainId: request.chainId,
        assetAddress,
        amount,
        walletAddress: request.accountAddress,
        assetSymbol: request.assetSymbol ?? "TOKEN",
      });
    default:
      throw new Error(`Unsupported Aave action ${request.kind}`);
  }
}

async function buildAaveActionSteps(request: AgentActionRequest) {
  const chain = CHAIN_BY_ID.get(request.chainId);
  if (!chain) {
    throw new Error(`Unsupported Aave chain ${request.chainId}`);
  }

  const step = getCoreStep(request);
  const txSteps = [];
  const assetAddress = getAssetAddress(request);
  const amount = getAtomicAmount(request);
  const requiresAllowance = ["lend_deposit", "yield_deposit", "repay"].includes(request.kind);

  if (requiresAllowance) {
    const allowance = await checkTokenAllowance({
      chainId: request.chainId,
      tokenAddress: assetAddress,
      owner: request.accountAddress,
      spender: chain.poolAddress,
    }).catch(() => 0n);

    if (allowance < amount) {
      txSteps.push(
        await prepareApprovalTransaction({
          chainId: request.chainId,
          tokenAddress: assetAddress,
          spender: chain.poolAddress,
          amount,
          assetSymbol: request.assetSymbol ?? "TOKEN",
        }),
      );
    }
  }

  txSteps.push(step);

  return txSteps;
}

export class AaveProtocolAdapter implements ProtocolAdapter {
  readonly protocol = "aave-v3";

  getCapabilities(): ProtocolAdapterCapabilities {
    return {
      protocol: this.protocol,
      supportedActions: ["lend_deposit", "lend_withdraw", "borrow", "repay", "yield_deposit", "yield_withdraw", "approve"],
      simulation: true,
      liveExecution: true,
      gasSponsorship: true,
      smartAccounts: true,
      eip7702: false,
      permits: false,
      notes: [
        "Gas sponsorship can cover transaction gas only where the wallet path supports it.",
        "Collateral, borrow exposure, protocol fees, and slippage are not gas-sponsored.",
      ],
    };
  }

  async quoteAction(request: AgentActionRequest): Promise<ActionQuote> {
    const txSteps = await buildAaveActionSteps(request);
    const gasEstimates = await Promise.all(
      txSteps.map((step) => estimateGasUsdForStep(step, request.accountAddress).catch(() => undefined)),
    );

    return {
      request,
      amountUsd: request.amountUsd,
      estimatedGasUsd: gasEstimates.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      metadata: {
        stepCount: txSteps.length,
      },
    };
  }

  async validateAction(request: AgentActionRequest): Promise<ActionValidation> {
    const chain = CHAIN_BY_ID.get(request.chainId);
    const supported = Boolean(chain) && this.getCapabilities().supportedActions.includes(request.kind);

    return {
      valid: supported,
      requiresApproval: ["lend_deposit", "yield_deposit", "repay"].includes(request.kind),
      reasons: supported ? [] : ["Aave action or chain is unsupported."],
      metadata: {
        chainLabel: chain?.label,
      },
    };
  }

  async simulateAction(request: AgentActionRequest): Promise<ActionSimulation> {
    const txSteps = await buildAaveActionSteps(request);
    const gasEstimates = await Promise.all(
      txSteps.map((step) => estimateGasUsdForStep(step, request.accountAddress).catch(() => undefined)),
    );

    return {
      simulated: true,
      success: gasEstimates.some((entry) => entry !== undefined),
      warnings: gasEstimates.every((entry) => entry === undefined) ? ["Gas estimation was unavailable for one or more steps."] : [],
      metadata: {
        gasEstimates,
      },
    };
  }

  async executeAction(request: AgentActionRequest): Promise<ActionExecutionBundle> {
    const txSteps = await buildAaveActionSteps(request);

    return {
      mode: "eoa",
      txSteps,
      sponsorship: {
        eligible: false,
        sponsored: false,
        mode: "none",
        metadata: {},
      },
      metadata: {
        stepCount: txSteps.length,
      },
    };
  }

  async getActionStatus(_request: AgentActionRequest, transactionHash?: string): Promise<ActionStatusResult> {
    return {
      status: transactionHash ? "pending" : "unsupported",
      message: transactionHash ? "Aave action submitted." : "No transaction hash recorded.",
      metadata: {},
    };
  }
}
