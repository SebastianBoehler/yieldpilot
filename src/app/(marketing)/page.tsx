import Link from "next/link";
import { ArrowRight, Bot, ShieldCheck, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

const highlights = [
  {
    icon: Bot,
    title: "Google ADK agent stack",
    description: "Strategy, risk, execution, and portfolio agents work as a real sequential ADK workflow instead of a single opaque prompt.",
  },
  {
    icon: Waypoints,
    title: "LI.FI capital movement layer",
    description: "Every rebalance route is priced, prepared, and tracked through LI.FI so bridge cost, gas, and slippage stay in the decision loop.",
  },
  {
    icon: ShieldCheck,
    title: "Policy-first autonomy",
    description: "Human approval and autonomous execution share the same transaction planner, allowance checks, and audit trail.",
  },
];

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.16),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.16),_transparent_24%),linear-gradient(180deg,_#fffdf7,_#eef4f2)] px-4 py-6 lg:px-6">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <Panel className="overflow-hidden bg-slate-950 text-white">
          <div className="grid gap-10 lg:grid-cols-[1.35fr_0.85fr]">
            <div className="space-y-8 p-2">
              <p className="inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-teal-200">
                YieldPilot MVP
              </p>
              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight lg:text-7xl">
                  Autonomous cross-chain treasury management for stablecoins.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-300">
                  YieldPilot scans live Aave stablecoin markets across Arbitrum, Base, and Optimism, prices the net carry after bridge and gas costs, and then routes capital with LI.FI under explicit risk policy.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/dashboard">
                  <Button className="bg-white text-slate-950 hover:bg-slate-100">
                    Open dashboard
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </Link>
                <Link href="/approvals">
                  <Button variant="ghost" className="border border-white/20 text-white hover:bg-white/10">
                    Review approval queue
                  </Button>
                </Link>
              </div>
            </div>
            <div className="grid gap-4">
              <Panel className="bg-white/10 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-200">Execution modes</p>
                <div className="mt-5 space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">Human approval</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      YieldPilot prepares the full transaction chain, exposes every allowance change, and waits for the user to sign each step.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Autonomous</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      A backend execution wallet can rebalance on schedule inside daily limits, protocol allowlists, and slippage guards.
                    </p>
                  </div>
                </div>
              </Panel>
              <Panel className="bg-linear-to-br from-teal-500/20 to-orange-400/20 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-white/70">What gets optimized</p>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-100">
                  <li>Live deposit APY from official Aave RPC reads</li>
                  <li>Bridge, swap, and gas drag through LI.FI routes</li>
                  <li>Cooldown windows and protocol / chain / asset allowlists</li>
                  <li>Explicit approval and transaction audit records in SQLite</li>
                </ul>
              </Panel>
            </div>
          </div>
        </Panel>

        <section className="grid gap-4 lg:grid-cols-3">
          {highlights.map((highlight) => {
            const Icon = highlight.icon;
            return (
              <Panel key={highlight.title}>
                <div className="inline-flex rounded-2xl bg-slate-950 p-3 text-white">
                  <Icon className="size-5" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">{highlight.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">{highlight.description}</p>
              </Panel>
            );
          })}
        </section>

        <Panel>
          <SectionHeading
            eyebrow="Execution loop"
            title="How YieldPilot decides"
            description="Each loop starts with live position discovery, scores alternative allocations after route costs, validates policy, then either queues approval or executes the plan."
          />
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              "Fetch live positions",
              "Scan stablecoin markets",
              "Price LI.FI routes",
              "Validate policy",
              "Queue or execute",
            ].map((step, index) => (
              <div key={step} className="rounded-[24px] border border-slate-200 bg-white px-5 py-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Step {index + 1}</p>
                <p className="mt-4 text-lg font-semibold text-slate-950">{step}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </main>
  );
}
