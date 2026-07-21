"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { NumberTicker } from "./number-ticker";
import { DemoBadge } from "./demo-badge";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  compact = false,
  hint,
  demo = false,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  compact?: boolean;
  hint?: string;
  demo?: boolean;
  className?: string;
}) {
  return (
    <Card glow className={cn("edge-glow relative overflow-hidden p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
            {label}
            {demo && <DemoBadge />}
          </p>
          <p className="mono mt-2.5 truncate text-2xl font-bold text-ink sm:text-[1.7rem]">
            <NumberTicker value={value} prefix={prefix} suffix={suffix} decimals={decimals} compact={compact} />
          </p>
          {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
        </div>
        {Icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald/25 bg-emerald/10 text-emerald-bright">
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </Card>
  );
}
