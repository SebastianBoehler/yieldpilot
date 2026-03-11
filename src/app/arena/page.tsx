import Link from "next/link";
import { Activity, ArrowRight, Newspaper, Radar, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatCompactNumber, formatPercent, formatUsd, shortenAddress } from "@/lib/utils/format";
import { getArenaSnapshot } from "@/server/services/arena-service";

export const revalidate = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value)}`;
}

function badgeToneForMode(mode: "HUMAN_APPROVAL" | "AUTONOMOUS") {
  return mode === "AUTONOMOUS" ? "warning" : "info";
}

function badgeToneForDecision(status?: string) {
  if (!status) {
    return "neutral";
  }

  if (status === "EXECUTED") {
    return "success";
  }

  if (status === "BLOCKED" || status === "FAILED" || status === "REJECTED") {
    return "danger";
  }

  if (status === "QUEUED_FOR_APPROVAL" || status === "EXECUTING") {
    return "warning";
  }

  return "neutral";
}

export default async function ArenaPage() {
  const snapshot = await getArenaSnapshot();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.16),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.16),_transparent_24%),linear-gradient(180deg,_#fffdf7,_#eef4f2)] px-4 py-6 lg:px-6">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <Panel className="overflow-hidden bg-slate-950 text-white">
          <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-6">
              <Badge tone="info">Public Arena</Badge>
              <div className="space-y-4">
                <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight lg:text-7xl">
                  Track YieldPilot agents like a live strategy arena.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-300">
                  This thin public board surfaces agent state from the runtime you already have: tracked TVL, latest actions, live market pulse, and a small research digest from public crypto feeds.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/dashboard">
                  <span className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
                    Open operator dashboard
                    <ArrowRight className="ml-2 size-4" />
                  </span>
                </Link>
                <Link href="/api/arena/summary">
                  <span className="inline-flex items-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                    Open JSON feed
                  </span>
                </Link>
              </div>
            </div>
            <div className="grid gap-4">
              <Panel className="bg-white/10 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-200">Snapshot</p>
                <div className="mt-5 space-y-3 text-sm leading-6 text-slate-200">
                  <p>Generated {new Date(snapshot.generatedAt).toLocaleString()}.</p>
                  <p>{snapshot.overview.totalAgents} tracked agents with {snapshot.overview.actionsLast24h} recorded actions in the last 24 hours.</p>
                  <p>{snapshot.overview.autonomousAgents} agent{snapshot.overview.autonomousAgents === 1 ? "" : "s"} currently configured for autonomous mode.</p>
                </div>
              </Panel>
              <Panel className="bg-linear-to-br from-teal-500/20 to-orange-400/20 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-white/70">Research inputs</p>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-100">
                  <li>Live market pulse from public crypto price APIs</li>
                  <li>News digest from public RSS feeds</li>
                  <li>Internal agent state from Postgres-backed run and decision records</li>
                </ul>
              </Panel>
            </div>
          </div>
        </Panel>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Tracked TVL" value={formatUsd(snapshot.overview.trackedTvlUsd)} />
          <MetricCard label="Tracked agents" value={String(snapshot.overview.totalAgents)} />
          <MetricCard label="Autonomous agents" value={String(snapshot.overview.autonomousAgents)} />
          <MetricCard label="Pending approvals" value={String(snapshot.overview.pendingApprovals)} />
          <MetricCard label="Actions (24h)" value={formatCompactNumber(snapshot.overview.actionsLast24h)} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <Panel>
            <SectionHeading
              eyebrow="Tracked agents"
              title="Runtime leaderboard"
              description="Each card is built from persisted strategy, run, approval, and action records. This is the right place to grow into a full public competition board."
            />
            {snapshot.agents.length ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {snapshot.agents.map((agent) => (
                  <div key={agent.strategyId} className="rounded-[24px] border border-slate-200 bg-white px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{shortenAddress(agent.walletAddress)}</p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{agent.strategyName}</h2>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={badgeToneForMode(agent.mode)}>{agent.mode.replace("_", " ")}</Badge>
                        <Badge tone={badgeToneForDecision(agent.lastDecision?.status)}>{agent.lastDecision?.status ?? "No decision"}</Badge>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Portfolio</p>
                        <p className="mt-2 text-xl font-semibold text-slate-950">{formatUsd(agent.totalPortfolioUsd)}</p>
                      </div>
                      <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Effective APY</p>
                        <p className="mt-2 text-xl font-semibold text-slate-950">{formatSignedPercent(agent.effectiveApy)}</p>
                      </div>
                      <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Pending approvals</p>
                        <p className="mt-2 text-xl font-semibold text-slate-950">{agent.pendingApprovals}</p>
                      </div>
                      <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Actions (24h)</p>
                        <p className="mt-2 text-xl font-semibold text-slate-950">{agent.recentActionCount}</p>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Last decision</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{agent.lastDecision?.summary ?? "No decision recorded yet."}</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-[20px] border border-slate-200 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Best opportunity</p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">
                            {agent.bestOpportunity
                              ? `${agent.bestOpportunity.chainLabel} ${agent.bestOpportunity.assetSymbol}`
                              : "No tracked opportunity"}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {agent.bestOpportunity
                              ? `${agent.bestOpportunity.protocolLabel} at ${formatSignedPercent(agent.bestOpportunity.apy)}`
                              : "Run the loop to refresh opportunity snapshots."}
                          </p>
                        </div>
                        <div className="rounded-[20px] border border-slate-200 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Largest allocations</p>
                          {agent.topAllocations.length ? (
                            <div className="mt-2 space-y-2">
                              {agent.topAllocations.map((allocation) => (
                                <div key={allocation.label} className="flex items-center justify-between gap-3 text-sm">
                                  <span className="text-slate-700">{allocation.label}</span>
                                  <span className="font-semibold text-slate-950">{formatUsd(allocation.value)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-slate-600">No allocations persisted yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6">
                <EmptyState
                  title="No tracked agents yet"
                  description="Run the existing YieldPilot agent loop once and this page will start showing public snapshots."
                />
              </div>
            )}
          </Panel>

          <div className="space-y-6">
            <Panel>
              <SectionHeading
                eyebrow="Market pulse"
                title="Live crypto tape"
                description="Thin external context for public viewers. This is intentionally read-only and should stay separate from execution policy."
              />
              <div className="mt-6 space-y-3">
                {snapshot.marketPulse.map((asset) => (
                  <div key={asset.symbol} className="flex items-center justify-between gap-3 rounded-[20px] bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex rounded-2xl bg-slate-950 p-2 text-white">
                        <TrendingUp className="size-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-950">{asset.symbol}</p>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{asset.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-950">{formatUsd(asset.priceUsd)}</p>
                      <p className={asset.change24h >= 0 ? "text-sm text-emerald-700" : "text-sm text-rose-700"}>{formatSignedPercent(asset.change24h)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <SectionHeading
                eyebrow="Research digest"
                title="News feed"
                description="Public RSS inputs you can later fold into a dedicated research agent, sentiment layer, or thesis memory."
              />
              {snapshot.newsFeed.length ? (
                <div className="mt-6 space-y-3">
                  {snapshot.newsFeed.map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-[22px] border border-slate-200 bg-white px-4 py-4 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                        <Newspaper className="size-3.5" />
                        {item.source}
                      </div>
                      <p className="mt-3 text-base font-semibold leading-6 text-slate-950">{item.title}</p>
                      {item.summary ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p> : null}
                      <p className="mt-3 text-xs text-slate-500">{new Date(item.publishedAt).toLocaleString()}</p>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="mt-6">
                  <EmptyState
                    title="No feed items loaded"
                    description="The arena stays usable even if public RSS feeds fail. Price and strategy snapshots still render."
                  />
                </div>
              )}
            </Panel>

            <Panel className="bg-slate-950 text-white">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/10 p-3">
                  <Radar className="size-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Next step</p>
                  <p className="mt-1 text-lg font-semibold">Turn this into a real multi-agent board</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                The execution core is already here. The next increment is to add research-agent outputs, thesis memory, and per-cycle reasoning logs as first-class public artifacts.
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm text-teal-200">
                <Activity className="size-4" />
                Keep ADK on orchestration, keep execution deterministic.
              </div>
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}
