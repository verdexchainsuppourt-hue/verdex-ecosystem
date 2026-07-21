"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint } from "@/lib/types";

const tooltipStyle = {
  background: "rgba(6, 16, 13, 0.96)",
  border: "1px solid rgba(87, 255, 179, 0.2)",
  borderRadius: "12px",
  fontSize: "12px",
  color: "#F4FFF9",
};

export function BarChartCard({
  data,
  color = "#22D3EE",
  height = 240,
  formatValue = (v: number) => v.toLocaleString("en-US"),
  label,
}: {
  data: ChartPoint[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
  label?: string;
}) {
  return (
    <div style={{ height }} role="img" aria-label={label ?? "Bar chart"}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(87,255,179,0.06)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#92AAA0", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={32} />
          <YAxis tick={{ fill: "#92AAA0", fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatValue(v)} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatValue(v), label ?? "Value"]} cursor={{ fill: "rgba(36,229,150,0.06)" }} />
          <Bar dataKey="value" fill={color} radius={[5, 5, 0, 0]} maxBarSize={26} animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
