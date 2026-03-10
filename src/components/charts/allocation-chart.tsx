"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const palette = ["#0f766e", "#f97316", "#fb7185", "#38bdf8", "#0f172a"];

export function AllocationChart({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={68} outerRadius={108} paddingAngle={2}>
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={palette[index % palette.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) =>
              `$${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
