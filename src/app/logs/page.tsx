import { AppShell } from "@/components/layout/app-shell";
import { WalletBar } from "@/components/layout/wallet-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { getExecutionLogs } from "@/server/services/strategy-service";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wallet = typeof params.wallet === "string" ? params.wallet : undefined;
  const walletType = params.walletType === "solana" ? "solana" : "evm";

  if (walletType === "solana") {
    return (
      <AppShell currentPath="/logs" walletBar={<WalletBar walletAddress={wallet} walletType="solana" />}>
        <EmptyState title="No Solana execution log yet" description="The persistent execution audit trail is currently tied to the EVM planner and approval model." />
      </AppShell>
    );
  }

  const logs = await getExecutionLogs(wallet);

  return (
    <AppShell currentPath="/logs" walletBar={<WalletBar walletAddress={wallet} walletType="evm" />}>
      <Panel className="space-y-6">
        <SectionHeading
          eyebrow="Execution log"
          title="Agent audit trail"
          description="Every loop, policy gate, and execution outcome is appended here so autonomous and manual flows share the same forensic trail."
        />
        {logs.length ? (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="rounded-[24px] border border-slate-200 bg-white px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{log.message}</p>
                  <p className="font-mono text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{log.level}</p>
                <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-200">
                  {JSON.stringify(log.context, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No execution logs yet" description="Run the agent loop to start recording decisions, approvals, and outcomes." />
        )}
      </Panel>
    </AppShell>
  );
}
