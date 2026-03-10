"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function ShellNavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  const searchParams = useSearchParams();
  const nextParams = new URLSearchParams(searchParams.toString());
  const targetHref = nextParams.size ? `${href}?${nextParams.toString()}` : href;

  return (
    <Link
      href={targetHref}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
        active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-900 hover:text-white",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
