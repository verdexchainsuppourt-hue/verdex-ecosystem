"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, ArrowLeftRight, Coins, Download, Droplets, Gift,
  Pickaxe, Trophy, Wallet as WalletIcon, Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SkeletonGrid } from "@/components/shared/states";
import { StatCard } from "@/components/shared/stat-card";
import { DemoBadge } from "@/components/shared/demo-badge";
import { MiningStatusPill, MiningChart } from "@/components/mining/mining-widgets";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth/auth-provider";
import { getMiningStatus } from "@/lib/api";
import { DEMO_SNAPSHOT, TRANSACTIONS } from "@/lib/mock-data";
import { fmtNum, fmtUSD, shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";

const txTone: Record<string, string> = {
  confirmed: "text-emerald-bright",
  pending: "text-amber",
  failed: "text-danger",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["mining-status"],
    queryFn: getMiningStatus,
    retry: 1,
  });

  const live = data?.success ? data : null;
  const vp = live?.wallet?.vp_balance ?? DEMO_SNAPSHOT.vpBalance;
  const usingLive = !!live;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">
            Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted">Your complete Verdex activity in one place.</p>
        </div>
        <MiningStatusPill status={live?.activeSession ? "online" : DEMO_SNAPSHOT.miningStatus} />
      </div>

      {!usingLive && !isLoading && (
        <p className="flex items-center gap-2 text-xs text-faint">
          <DemoBadge /> Live account metrics unavailable{isError ? " (API unreachable)" : ""} — showing demo values.
        </p>
      )}

      {/* summary cards */}
      {isLoading ? (
        <SkeletonGrid count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Zap} label="VP Balance" value={vp} decimals={1} suffix=" VP" hint="Verdex Points" />
          <StatCard icon={Coins} label="VDX Balance" value={DEMO_SNAPSHOT.vdxBalance} decimals={2} suffix=" VDX" demo hint="On-chain wallet" />
          <StatCard icon={Gift} label="Pending Rewards" value={DEMO_SNAPSHOT.pendingRewards} decimals={1} suffix=" VP" demo hint="Accruing this session" />
          <StatCard icon={Trophy} label="Miner Rank" value={DEMO_SNAPSHOT.rank} prefix="#" demo hint="By VP balance" />
        </div>
      )}

      {/* mining + liquidity overview */}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <MiningChart />
        <Card className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-bold text-ink">Quick actions</h2>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-3">
            <QuickAction href="/dashboard/mining" icon={Pickaxe} label="Mining" note="Workers & payouts" />
            <QuickAction href="/dashboard/downloads" icon={Download} label="Downloads" note="Miner v4.0.2" />
            <QuickAction href="/dashboard/wallet" icon={WalletIcon} label="Wallet" note="Send & receive" />
            <QuickAction href="/swap" icon={ArrowLeftRight} label="Swap" note="Trade tokens" />
            <QuickAction href="/liquidity" icon={Droplets} label="Liquidity" note="Pools & LP fees" />
            <QuickAction href="/dashboard/rewards" icon={Gift} label="Rewards" note="Claim VP → VDX" />
          </div>
          <div className="rounded-xl border border-line bg-black/25 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Liquidity position value</span>
              <span className="mono font-semibold text-ink">{fmtUSD(4820.5)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-faint">
              <span>2 active positions</span>
              <DemoBadge />
            </div>
          </div>
        </Card>
      </div>

      {/* recent transactions */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="font-heading text-base font-bold text-ink">Recent transactions</h2>
          <Link href="/dashboard/transactions" className="group flex items-center gap-1 text-xs font-semibold text-emerald-bright">
            View all <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <ul className="divide-y divide-line/60">
          {TRANSACTIONS.slice(0, 4).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-emerald/[0.03]">
              <div className="flex min-w-0 items-center gap-3">
                <Badge variant="neutral" className="shrink-0">{t.type}</Badge>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{t.summary}</p>
                  <p className="mono text-[11px] text-faint">{shortHash(t.hash)}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn("mono text-sm font-semibold", txTone[t.status])}>{fmtUSD(t.value)}</p>
                <p className="text-[11px] text-faint">{t.time}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* account security strip */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="font-heading text-sm font-bold text-ink">Account security</h2>
          <p className="mt-0.5 text-xs text-muted">Email verified · {fmtNum(2)} active device tokens · sessions managed in Settings</p>
        </div>
        <Link href="/dashboard/settings">
          <Button variant="outline" size="sm">Review security</Button>
        </Link>
      </Card>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label, note }: { href: string; icon: typeof Pickaxe; label: string; note: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-line bg-black/25 p-4 transition-all hover:border-emerald/40 hover:shadow-glow-sm"
    >
      <Icon className="h-5 w-5 text-emerald-bright" />
      <div>
        <p className="text-sm font-semibold text-ink group-hover:text-emerald-bright">{label}</p>
        <p className="text-[11px] text-faint">{note}</p>
      </div>
    </Link>
  );
}
