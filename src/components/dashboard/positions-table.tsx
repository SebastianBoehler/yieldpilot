import { Badge } from "@/components/ui/badge";
import { formatPercent, formatUsd } from "@/lib/utils/format";
import type { DashboardPosition } from "@/types/domain";

export function PositionsTable({
  positions,
}: {
  positions: DashboardPosition[];
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200">
      <div className="grid grid-cols-[1.4fr_0.9fr_0.7fr_0.8fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        <span>Position</span>
        <span>Chain / source</span>
        <span>Carry</span>
        <span className="text-right">Value</span>
      </div>
      <div className="divide-y divide-slate-200 bg-white">
        {positions.map((position) => (
          <div key={position.id} className="grid grid-cols-[1.4fr_0.9fr_0.7fr_0.8fr] gap-3 px-4 py-4 text-sm">
            <div>
              <p className="font-semibold text-slate-950">{position.assetSymbol}</p>
              <p className="mt-1 text-slate-500">{position.protocolLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{position.chainLabel}</Badge>
              <Badge tone={position.positionType === "lending" ? "success" : "neutral"}>{position.positionType}</Badge>
            </div>
            <div className="font-semibold text-slate-900">{formatPercent(position.apy)}</div>
            <div className="text-right font-semibold text-slate-950">{formatUsd(position.balanceUsd)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
