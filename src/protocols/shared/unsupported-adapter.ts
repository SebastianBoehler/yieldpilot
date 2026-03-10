import type {
  ActionExecutionBundle,
  ActionQuote,
  ActionSimulation,
  ActionStatusResult,
  ActionValidation,
  AgentActionKind,
  AgentActionRequest,
  ProtocolAdapter,
  ProtocolAdapterCapabilities,
} from "@/agent/types";

export class UnsupportedProtocolAdapter implements ProtocolAdapter {
  constructor(
    public readonly protocol: string,
    private readonly supportedActions: AgentActionKind[],
    private readonly note: string,
  ) {}

  getCapabilities(): ProtocolAdapterCapabilities {
    return {
      protocol: this.protocol,
      supportedActions: this.supportedActions,
      simulation: false,
      liveExecution: false,
      gasSponsorship: false,
      smartAccounts: false,
      eip7702: false,
      permits: false,
      notes: [this.note],
    };
  }

  async quoteAction(request: AgentActionRequest): Promise<ActionQuote> {
    return {
      request,
      amountUsd: request.amountUsd,
      metadata: {
        unsupported: true,
        reason: this.note,
      },
    };
  }

  async validateAction(): Promise<ActionValidation> {
    return {
      valid: false,
      requiresApproval: false,
      reasons: [this.note],
      metadata: {
        unsupported: true,
      },
    };
  }

  async simulateAction(): Promise<ActionSimulation> {
    return {
      simulated: false,
      success: false,
      warnings: [this.note],
      metadata: {
        unsupported: true,
      },
    };
  }

  async executeAction(): Promise<ActionExecutionBundle> {
    return {
      mode: "eoa",
      txSteps: [],
      sponsorship: {
        eligible: false,
        sponsored: false,
        mode: "none",
        metadata: {
          unsupported: true,
        },
        reason: this.note,
      },
      metadata: {
        unsupported: true,
      },
    };
  }

  async getActionStatus(): Promise<ActionStatusResult> {
    return {
      status: "unsupported",
      message: this.note,
      metadata: {
        unsupported: true,
      },
    };
  }
}
