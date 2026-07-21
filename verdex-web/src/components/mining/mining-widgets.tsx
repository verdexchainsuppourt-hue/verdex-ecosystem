"use client";

import { useState } from "react";
import { Check, Copy, Pencil, Power } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChartCard } from "@/components/charts/area-chart";
import { DemoBadge } from "@/components/shared/demo-badge";
import { EmptyState } from "@/components/shared/states";
import { HASHRATE_SERIES, WORKERS } from "@/lib/mock-data";
import type { MiningStatus, Worker } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ---------- status pill ---------- */
export function MiningStatusPill({ status }: { status: MiningStatus }) {
  const meta = {
    online: { label: "Mining Online", cls: "border-emerald/40 bg-emerald/10 text-emerald-bright", dot: "bg-emerald animate-pulse-dot" },
    offline: { label: "Offline", cls: "border-danger/40 bg-danger/10 text-danger", dot: "bg-danger" },
    syncing: { label: "Syncing", cls: "border-amber/40 bg-amber/10 text-amber", dot: "bg-amber animate-pulse" },
  }[status];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold", meta.cls)}>
      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

/* ---------- hashrate chart ---------- */
export function MiningChart() {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-bold text-ink">Hashrate — last 30 days</h3>
          <p className="text-xs text-faint">Historical worker performance</p>
        </div>
        <DemoBadge />
      </div>
      <AreaChartCard
        data={HASHRATE_SERIES}
        color="#24E596"
        height={240}
        label="Hashrate"
        formatValue={(v) => `${(v / 1000).toFixed(1)} kH/s`}
      />
    </Card>
  );
}

/* ---------- worker table ---------- */
export function WorkerTable({ workers = WORKERS }: { workers?: Worker[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyAuthCmd(w: Worker) {
    navigator.clipboard
      .writeText(`verdex-miner auth --token <create-token-in-downloads> --worker ${w.name}`)
      .then(() => toast.success("Auth command template copied"))
      .catch(() => {});
    setCopiedId(w.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  if (workers.length === 0) {
    return (
      <EmptyState
        title="No workers yet"
        description="Download the miner and authenticate a device to see it here."
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-5 pb-0">
        <h3 className="font-heading text-base font-bold text-ink">Workers</h3>
        <DemoBadge />
      </div>
      <div className="overflow-x-auto p-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Worker</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Hashrate</TableHead>
              <TableHead className="text-right">VP today</TableHead>
              <TableHead>Last share</TableHead>
              <TableHead>Version</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  <span className="block font-semibold text-ink">{w.name}</span>
                  <span className="text-xs text-faint">{w.device}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={w.status === "online" ? "default" : w.status === "syncing" ? "amber" : "danger"}>
                    {w.status}
                  </Badge>
                </TableCell>
                <TableCell className="mono text-right">{w.hashRate > 0 ? `${(w.hashRate / 1000).toFixed(2)} kH/s` : "—"}</TableCell>
                <TableCell className="mono text-right text-emerald-bright">{w.vpToday > 0 ? `+${w.vpToday.toFixed(1)}` : "—"}</TableCell>
                <TableCell className="text-muted">{w.lastShare}</TableCell>
                <TableCell className="mono text-muted">{w.version}</TableCell>
                <TableCell>
                  <span className="flex justify-end gap-1.5">
                    <button
                      onClick={() => copyAuthCmd(w)}
                      aria-label={`Copy auth command for ${w.name}`}
                      title="Copy auth command"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-emerald/40 hover:text-emerald-bright"
                    >
                      {copiedId === w.id ? <Check className="h-3.5 w-3.5 text-emerald-bright" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => toast.info("Rename worker", { description: "Worker management syncs with the miner backend." })}
                      aria-label={`Rename ${w.name}`}
                      title="Rename worker"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-emerald/40 hover:text-emerald-bright"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toast.warning("Disable worker", { description: "Revoke this device's API token in Downloads to fully disable it." })}
                      aria-label={`Disable ${w.name}`}
                      title="Disable worker"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-danger/40 hover:text-danger"
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
