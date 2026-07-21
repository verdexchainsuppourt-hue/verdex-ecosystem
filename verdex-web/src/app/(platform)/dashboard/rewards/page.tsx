"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { DemoBadge } from "@/components/shared/demo-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/states";
import { requestPayout } from "@/lib/api";
import { DEMO_SNAPSHOT, REWARDS } from "@/lib/mock-data";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

const statusTone: Record<string, string> = {
  credited: "text-emerald-bright border-emerald/30 bg-emerald/10",
  pending: "text-amber border-amber/30 bg-amber/10",
  claimable: "text-cyan border-cyan/30 bg-cyan/10",
};

export default function RewardsPage() {
  const [claiming, setClaiming] = useState(false);
  const snap = DEMO_SNAPSHOT;
  const claimable = REWARDS.filter((r) => r.status === "claimable");

  async function claim() {
    setClaiming(true);
    try {
      const res = await requestPayout();
      toast.success(res.message ?? "Payout requested — VP converts to VDX at claim finality.");
    } catch (e) {
      toast.error("Payout unavailable", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">Rewards</h1>
          <p className="mt-1 text-sm text-muted">VP balances, credits and payouts.</p>
        </div>
        <DemoBadge />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Gift} label="VP Balance" value={snap.vpBalance} decimals={1} suffix=" VP" demo />
        <StatCard icon={Gift} label="Pending" value={snap.pendingRewards} decimals={1} suffix=" VP" demo hint="Accrues until payout" />
        <StatCard icon={Gift} label="Total Mined" value={snap.totalMined} decimals={1} suffix=" VP" demo />
      </div>

      <Card className="edge-glow flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="font-heading text-lg font-bold text-ink">Claimable now</h2>
          <p className="mono mt-1 text-2xl font-bold text-emerald-bright">{fmtNum(claimable.reduce((s, r) => s + r.amountVdx, 0), 2)} VDX</p>
          <p className="text-xs text-faint">Converts at claim finality · KYC-approved accounts capped at 25 VDX per UTC day</p>
        </div>
        <Button size="lg" onClick={claim} disabled={claiming}>
          <Gift className="h-4 w-4" /> {claiming ? "Requesting…" : "Request Payout"}
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-5 pb-0">
          <h2 className="font-heading text-base font-bold text-ink">Reward history</h2>
        </div>
        {REWARDS.length === 0 ? (
          <div className="p-5"><EmptyState title="No rewards yet" description="Mine VP or provide liquidity to start earning." /></div>
        ) : (
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">VP</TableHead>
                <TableHead className="text-right">VDX</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {REWARDS.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted">{r.date}</TableCell>
                  <TableCell><Badge variant="neutral">{r.source}</Badge></TableCell>
                  <TableCell className="mono text-right">{r.amountVp > 0 ? fmtNum(r.amountVp, 1) : "—"}</TableCell>
                  <TableCell className="mono text-right text-emerald-bright">{r.amountVdx > 0 ? fmtNum(r.amountVdx, 2) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", statusTone[r.status])}>
                      {r.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
