"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Coins, Download, Gift, Gauge, Pickaxe, Timer, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { DemoBadge } from "@/components/shared/demo-badge";
import { SkeletonGrid } from "@/components/shared/states";
import { MiningChart, MiningStatusPill, WorkerTable } from "@/components/mining/mining-widgets";
import { getMiningStatus, requestPayout } from "@/lib/api";
import { DEMO_SNAPSHOT } from "@/lib/mock-data";
import { fmtNum } from "@/lib/format";

export default function MiningDashboardPage() {
  const [payoutLoading, setPayoutLoading] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mining-status"],
    queryFn: getMiningStatus,
    retry: 1,
    refetchInterval: 30_000,
  });

  const live = data?.success ? data : null;
  const snap = DEMO_SNAPSHOT;

  async function payout() {
    setPayoutLoading(true);
    try {
      const res = await requestPayout();
      toast.success(res.message ?? "Payout requested — VP converts to VDX at claim finality.");
    } catch (e) {
      toast.error("Payout unavailable", {
        description: e instanceof Error ? e.message : "The payout endpoint is unreachable right now.",
      });
    } finally {
      setPayoutLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">Mining Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Workers, hashrate, rewards and payouts.</p>
        </div>
        <MiningStatusPill status={live?.activeSession ? "online" : snap.miningStatus} />
      </div>

      {!live && !isLoading && (
        <p className="flex items-center gap-2 text-xs text-faint">
          <DemoBadge /> {isError ? "Mining API unreachable —" : "No live session data —"} showing demo values.
          <button onClick={() => refetch()} className="text-emerald-bright underline">Retry</button>
        </p>
      )}

      {isLoading ? (
        <SkeletonGrid count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Gauge} label="Current Hashrate" value={snap.hashRate / 1000} decimals={2} suffix=" kH/s" demo={!live} />
          <StatCard icon={TrendingUp} label="Avg Hashrate (24h)" value={snap.avgHashRate / 1000} decimals={2} suffix=" kH/s" demo={!live} />
          <StatCard icon={Pickaxe} label="Total Mined" value={live?.wallet?.total_vp ?? snap.totalMined} decimals={1} suffix=" VP" demo={!live} />
          <StatCard icon={Users} label="Active Workers" value={live?.activeSession ? 1 : snap.activeMiners} demo={!live} hint={`${snap.streak}-day streak · best ${snap.longestStreak}`} />
        </div>
      )}

      {/* rewards + payout */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <Card className="edge-glow flex flex-col gap-5 p-6">
          <h2 className="font-heading text-lg font-bold text-ink">Rewards</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-black/25 p-4">
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-faint"><Timer className="h-3 w-3" /> Pending</p>
              <p className="mono mt-1.5 text-xl font-bold text-amber">{fmtNum(snap.pendingRewards, 1)} VP</p>
            </div>
            <div className="rounded-xl border border-line bg-black/25 p-4">
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-faint"><Coins className="h-3 w-3" /> Available</p>
              <p className="mono mt-1.5 text-xl font-bold text-emerald-bright">{fmtNum(live?.wallet?.vp_balance ?? snap.vpBalance, 1)} VP</p>
            </div>
          </div>
          <Button size="lg" className="w-full" onClick={payout} disabled={payoutLoading}>
            <Gift className="h-4 w-4" /> {payoutLoading ? "Requesting…" : "Request Payout (VP → VDX)"}
          </Button>
          <p className="text-[11px] leading-relaxed text-faint">
            Payouts convert eligible VP to VDX at claim finality per protocol rules.
            KYC-approved accounts are capped at 25 VDX per UTC day.
          </p>
          <Link href="/dashboard/downloads" className="mt-auto">
            <Button variant="outline" className="w-full"><Download className="h-4 w-4" /> Download Latest Miner</Button>
          </Link>
        </Card>
        <MiningChart />
      </div>

      <WorkerTable />
    </div>
  );
}
