"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint } from "@/lib/types";

const tooltipStyle = {
  background: "rgba(6, 16, 13, 0.96)",
  border: "1px solid rgba(87, 255, 179, 0.2)",
  borderRadius: "12px",
  fontSize: "12px",
  color: "#F4FFF9",
  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
};

export function AreaChartCard({
  data,
  color = "#24E596",
  height = 260,
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
    <div style={{ height }} role="img" aria-label={label ?? "Area chart"}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(87,255,179,0.06)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#92AAA0", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={32} />
          <YAxis tick={{ fill: "#92AAA0", fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatValue(v)} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatValue(v), label ?? "Value"]} labelStyle={{ color: "#92AAA0" }} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.2} fill={`url(#grad-${color.replace("#", "")})`} animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
