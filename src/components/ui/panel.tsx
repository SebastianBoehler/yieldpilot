import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}
