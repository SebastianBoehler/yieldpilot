import Link from "next/link";
import { ArrowRight, Bot, ShieldCheck, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

const highlights = [
  {
    icon: Bot,
    title: "Generic action loop",
    description: "Portfolio and market analysts still run through the ADK workflow, but execution now flows through a generic action model, protocol adapters, and a persistent cycle trace.",
  },
  {
    icon: Waypoints,
    title: "Gas-aware protocol execution",
    description: "DEX, bridge, and lending actions run through adapter interfaces that price cost and compatibility first, then request sponsorship or fall back cleanly.",
  },
  {
    icon: ShieldCheck,
    title: "Policy-first autonomy",
    description: "Human approval and autonomous execution share the same hardcoded limits, simulations, circuit breaker, and audit trail.",
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
                YieldPilot Main Agent
              </p>
              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight lg:text-7xl">
                  Autonomous onchain agent infrastructure with yield as the first live strategy.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-300">
                  YieldPilot now centers on a production-oriented action loop with gas-aware execution, protocol adapters, safety guards, and Railway deployment. The original yield optimizer remains live as the first strategy pack on top of that runtime.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/arena">
                  <Button className="bg-white text-slate-950 hover:bg-slate-100">
                    Open public arena
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="ghost" className="border border-white/20 text-white hover:bg-white/10">
                    Open dashboard
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
                      YieldPilot prepares the full action bundle, exposes every allowance change, and waits for approval before any live submission.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Autonomous</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      A backend execution wallet can act on schedule inside daily limits, contract allowlists, simulation requirements, and circuit-breaker controls.
                    </p>
                  </div>
                </div>
              </Panel>
              <Panel className="bg-linear-to-br from-teal-500/20 to-orange-400/20 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-white/70">What ships live in phase 1</p>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-100">
                  <li>Yield-agent strategy using official Aave RPC data</li>
                  <li>DEX and bridge routing through LI.FI adapters</li>
                  <li>Hardcoded risk limits, simulations, and action caps</li>
                  <li>Persistent cycle, action, and transaction audit records in Postgres</li>
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
            title="How the main agent decides"
            description="Each cycle starts with live position discovery, normalizes candidate actions, validates hard risk limits, simulates supported actions, and only then queues or executes the plan."
          />
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              "Fetch live positions",
              "Collect strategy signals",
              "Quote protocol actions",
              "Validate and simulate",
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
