import { cn } from "@/lib/utils/cn";

const toneClasses = {
  success: "bg-emerald-100 text-emerald-900",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-rose-100 text-rose-900",
  info: "bg-sky-100 text-sky-900",
  neutral: "bg-slate-100 text-slate-800",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneClasses;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-[0.18em] uppercase",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}
