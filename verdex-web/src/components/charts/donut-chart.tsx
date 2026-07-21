"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

const tooltipStyle = {
  background: "rgba(6, 16, 13, 0.96)",
  border: "1px solid rgba(87, 255, 179, 0.2)",
  borderRadius: "12px",
  fontSize: "12px",
  color: "#F4FFF9",
};

export function DonutChart({
  data,
  height = 240,
  centerLabel,
  centerValue,
}: {
  data: DonutSlice[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  return (
    <div className="relative" style={{ height }} role="img" aria-label={centerLabel ?? "Distribution chart"}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={3}
            strokeWidth={0}
            animationDuration={900}
          >
            {data.map((s) => (
              <Cell key={s.name} fill={s.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [`${v}%`, name]} />
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="mono text-2xl font-bold text-ink">{centerValue}</span>
          {centerLabel && <span className="text-[11px] uppercase tracking-wider text-muted">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}
