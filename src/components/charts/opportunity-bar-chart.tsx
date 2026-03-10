"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function OpportunityBarChart({
  data,
}: {
  data: Array<{ label: string; apy: number }>;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => `${Number(value ?? 0).toFixed(2)}%`} />
          <Bar dataKey="apy" radius={[12, 12, 0, 0]} fill="#0f766e" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
