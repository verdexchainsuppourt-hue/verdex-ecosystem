"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Blocks, Gauge, Users } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { SectionHeading } from "@/components/shared/section-heading";
import { SkeletonGrid } from "@/components/shared/states";
import { getChainStats } from "@/lib/api";

/**
 * Platform statistics.
 * Block height & tx count come from the live chain bridge.
 * Miner/account metrics have no public endpoint yet → demo-labeled placeholders.
 */
export function StatsStrip() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["chain-stats"],
    queryFn: getChainStats,
    refetchInterval: 15_000,
  });

  const live = data?.success && data.data;
  const height = live ? data.data!.height : 0;
  const txs = live ? data.data!.totalTransactions : 0;

  return (
    <section className="container py-16" aria-label="Platform statistics">
      <SectionHeading
        tag="Network"
        title={<>The chain, <span className="text-gradient">by the numbers.</span></>}
        description="Live figures come from the Verdex chain bridge. Anything estimated is explicitly marked as demo data."
      />
      <div className="mt-12">
        {isLoading ? (
          <SkeletonGrid count={4} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Blocks} label="Block Height" value={height} hint={live ? "Live · chain bridge" : isError ? "Bridge unreachable" : "Awaiting mainnet"} />
            <StatCard icon={Activity} label="Total Transactions" value={txs} hint={live ? "Live · chain bridge" : "Awaiting mainnet"} />
            <StatCard icon={Users} label="Active Miners" value={2140} demo hint="Public counter endpoint coming soon" />
            <StatCard icon={Gauge} label="Supported Networks" value={1} hint="Verdex Mainnet · expansion on roadmap" />
          </div>
        )}
        {isError && (
          <p className="mt-3 text-center text-xs text-faint">
            Live stats temporarily unavailable. <button className="text-emerald-bright underline" onClick={() => refetch()}>Retry</button>
          </p>
        )}
      </div>
    </section>
  );
}
