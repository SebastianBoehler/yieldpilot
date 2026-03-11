import Link from "next/link";
import { ArrowRight, Bot, ShieldCheck, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";

const highlights = [
  {
    icon: Bot,
    title: "Virtuals ACP services",
    description: "YieldPilot now exposes two ACP-first provider agents: one for structured crypto research and one for non-custodial trade planning.",
  },
  {
    icon: Waypoints,
    title: "LI.FI routing",
    description: "Spot swaps and bridge routes are planned through LI.FI, then serialized into dry-run transaction bundles and approval-gated execution handoff.",
  },
  {
    icon: ShieldCheck,
    title: "Non-custodial by default",
    description: "ACP jobs never directly execute user principal transfers. YieldPilot returns structured plans, signals, and resource endpoints with explicit guardrails.",
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
                YieldPilot Virtuals ACP
              </p>
              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight lg:text-7xl">
                  Virtuals-native crypto research and trade-planning services backed by YieldPilot.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-300">
                  This repo now centers on an ACP-first provider runtime. YieldPilot exposes research outputs, whale-watch alerts, token launch analysis, and LI.FI-backed trade plans while keeping execution non-custodial and approval-gated.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/api/virtuals/manifest">
                  <Button className="bg-white text-slate-950 hover:bg-slate-100">
                    Open ACP manifest
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="ghost" className="border border-white/20 text-white hover:bg-white/10">
                    Open execution handoff
                  </Button>
                </Link>
                <Link href="/api/virtuals/resources/methodology?agent=yieldpilot-research">
                  <Button variant="ghost" className="border border-white/20 text-white hover:bg-white/10">
                    Open methodology
                  </Button>
                </Link>
              </div>
            </div>
            <div className="grid gap-4">
              <Panel className="bg-white/10 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-200">Provider agents</p>
                <div className="mt-5 space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">YieldPilot Research</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      Paid ACP research services for token launches, whale-watch alerts, and trade signal generation with strict JSON outputs.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">YieldPilot Trade Planner</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      Paid ACP planning services for spot swaps and rebalance plans that rely on LI.FI and YieldPilot policy checks but never take custody.
                    </p>
                  </div>
                </div>
              </Panel>
              <Panel className="bg-linear-to-br from-teal-500/20 to-orange-400/20 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-white/70">What ships live in v1</p>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-100">
                  <li>Virtuals ACP worker with separate research and trade-planner agents</li>
                  <li>DexScreener, CoinGecko, DefiLlama, RSS, and watchlist-based explorer inputs</li>
                  <li>LI.FI-backed spot routing and YieldPilot rebalance plan generation</li>
                  <li>Postgres-backed signal history, launch analysis, whale alerts, and ACP job audits</li>
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
            eyebrow="Service flow"
            title="How the ACP provider responds"
            description="Every ACP request is validated first, then routed into either the research pipeline or the trade planner. Both paths return structured JSON and preserve an audit trail."
          />
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              "Accept ACP job",
              "Normalize request",
              "Fetch research or LI.FI data",
              "Run policy or synthesis",
              "Deliver structured JSON",
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
