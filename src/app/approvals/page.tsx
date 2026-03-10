import { ApprovalActions } from "@/components/approvals/approval-actions";
import { AppShell } from "@/components/layout/app-shell";
import { WalletBar } from "@/components/layout/wallet-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatPercent, formatUsd } from "@/lib/utils/format";
import { getApprovalQueue } from "@/server/services/approval-service";
import type { ConnectedWalletType } from "@/types/domain";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wallet = typeof params.wallet === "string" ? params.wallet : undefined;
  const walletType = params.walletType === "solana" ? "solana" : "evm";

  if (walletType === "solana") {
    return (
      <AppShell currentPath="/approvals" walletBar={<WalletBar walletAddress={wallet} walletType="solana" />}>
        <EmptyState title="Solana approvals are not wired yet" description="The current approval queue and execution planner are still EVM-only. Solana wallet support currently focuses on asset visibility." />
      </AppShell>
    );
  }

  const approvals = await getApprovalQueue(wallet);

  return (
    <AppShell currentPath="/approvals" walletBar={<WalletBar walletAddress={wallet} walletType={walletType as ConnectedWalletType} />}>
      <Panel className="space-y-6">
        <SectionHeading
          eyebrow="Human-in-the-loop"
          title="Approval queue"
          description="Every manual-mode rebalance exposes the exact transaction sequence, the expected carry uplift, and the LI.FI route assumptions before anything is signed."
        />
        {approvals.length ? (
          <div className="space-y-4">
            {approvals.map((approval) => (
              <Panel key={approval.id} className="bg-white">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Badge tone="warning">{approval.status}</Badge>
                      <p className="text-sm text-slate-500">{new Date(approval.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-slate-950">
                        {approval.executionPlan.sourceAsset} → {approval.executionPlan.destinationAsset}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{approval.executionPlan.rationale}</p>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Expected APY delta</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatPercent(approval.executionPlan.expectedApyDelta)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Bridge cost</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatUsd(approval.executionPlan.bridgeCostUsd)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Gas estimate</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatUsd(approval.executionPlan.gasCostUsd)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Net benefit</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatUsd(approval.executionPlan.expectedNetBenefitUsd)}</p>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      {approval.executionPlan.txSteps.map((step) => (
                        <div key={step.stepKey} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-slate-900">{step.title}</p>
                            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{step.transactionType}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{step.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <ApprovalActions approvalId={approval.id} />
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing waiting for approval" description="Run the agent loop in human mode to push a live rebalance proposal into the queue." />
        )}
      </Panel>
    </AppShell>
  );
}
