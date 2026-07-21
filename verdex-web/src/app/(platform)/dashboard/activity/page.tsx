"use client";

import { useState } from "react";
import { TerminalSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/shared/demo-badge";
import { BarChartCard } from "@/components/charts/bar-chart";
import { EmptyState } from "@/components/shared/states";
import { VP_EARNINGS_SERIES } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const LOG_LINES = [
  { t: "14:02:11", level: "ok", msg: "heartbeat accepted · +0.42 VP · worker windows-rig-01" },
  { t: "14:02:11", level: "ok", msg: "share validated · difficulty 4.2 · latency 38ms" },
  { t: "13:47:03", level: "ok", msg: "heartbeat accepted · +0.42 VP · worker windows-rig-01" },
  { t: "13:47:02", level: "info", msg: "job received · epoch 214 · template refreshed" },
  { t: "13:31:55", level: "ok", msg: "heartbeat accepted · +0.42 VP · worker android-pixel" },
  { t: "13:31:54", level: "warn", msg: "worker linux-node missed heartbeat window (offline 3h)" },
  { t: "13:16:48", level: "ok", msg: "heartbeat accepted · +0.42 VP · worker windows-rig-01" },
  { t: "13:01:32", level: "info", msg: "session resumed · windows-rig-01 · v4.0.2" },
];

const tone: Record<string, string> = {
  ok: "text-emerald-bright",
  info: "text-cyan",
  warn: "text-amber",
  error: "text-danger",
};

export default function ActivityPage() {
  const [paused, setPaused] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">Mining Activity</h1>
          <p className="mt-1 text-sm text-muted">Earnings history and live miner logs.</p>
        </div>
        <DemoBadge />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-base font-bold text-ink">VP earnings — last 30 days</h2>
            <p className="text-xs text-faint">Daily Verdex Points credited</p>
          </div>
        </div>
        <BarChartCard data={VP_EARNINGS_SERIES} color="#24E596" height={260} label="VP" formatValue={(v) => `${v.toFixed(0)} VP`} />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-5">
          <div className="flex items-center gap-2.5">
            <TerminalSquare className="h-5 w-5 text-emerald-bright" />
            <h2 className="font-heading text-base font-bold text-ink">Miner logs</h2>
            <Badge variant="cyan">live tail</Badge>
          </div>
          <button
            onClick={() => setPaused((v) => !v)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
            aria-pressed={paused}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
        <div className="max-h-[380px] overflow-y-auto bg-black/40 p-4 font-mono text-[12.5px] leading-relaxed">
          {LOG_LINES.map((l, i) => (
            <p key={i} className="flex gap-3 py-0.5">
              <span className="shrink-0 text-faint">{l.t}</span>
              <span className={cn("shrink-0 uppercase", tone[l.level])}>[{l.level}]</span>
              <span className="text-mist">{l.msg}</span>
            </p>
          ))}
          {paused && <p className="mt-2 text-amber">— log tail paused —</p>}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-heading text-base font-bold text-ink">Submitted work</h2>
        <EmptyState
          title="Share history endpoint coming soon"
          description="Per-share submission history will appear here when the pool's public statistics endpoint ships."
        />
      </Card>
    </div>
  );
}
