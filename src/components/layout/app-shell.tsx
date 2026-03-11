"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Activity, BadgeCheck, Layers3, LayoutDashboard, ListChecks, Logs, Radar, Sparkles, Wallet } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/arena", label: "Arena", icon: Radar },
  { href: "/indexes", label: "Indexes", icon: Layers3 },
  { href: "/opportunities", label: "Opportunities", icon: Sparkles },
  { href: "/approvals", label: "Approvals", icon: BadgeCheck },
  { href: "/logs", label: "Execution Log", icon: Logs },
  { href: "/settings", label: "Strategy", icon: ListChecks },
];

export function AppShell({
  currentPath,
  walletBar,
  children,
}: {
  currentPath: string;
  walletBar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.15),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.18),_transparent_28%),linear-gradient(180deg,_#fffdf7,_#f3f7f6)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-72 shrink-0 rounded-[32px] border border-white/70 bg-slate-950 p-6 text-white shadow-[0_24px_80px_-30px_rgba(15,23,42,0.9)] lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-linear-to-br from-[#0f766e] to-[#f97316] p-3">
              <Wallet className="size-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">YieldPilot</p>
              <h1 className="text-xl font-semibold tracking-tight">Autonomous Onchain Agent</h1>
            </div>
          </div>
          <nav className="mt-10 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = currentPath.startsWith(item.href);
              const targetHref = query ? `${item.href}?${query}` : item.href;

              return (
                <Link
                  key={item.href}
                  href={targetHref}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
                    active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-900 hover:text-white",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto rounded-[28px] bg-slate-900/80 p-5">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Activity className="size-4 text-emerald-400" />
              Loop monitoring is enabled
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              YieldPilot now runs as a production-oriented onchain agent runtime. Yield optimization remains the first live strategy pack, with gasless-compatible execution plumbing and protocol adapters behind the same loop.
            </p>
          </div>
        </aside>
        <main className="flex-1 space-y-6">{walletBar}{children}</main>
      </div>
    </div>
  );
}
