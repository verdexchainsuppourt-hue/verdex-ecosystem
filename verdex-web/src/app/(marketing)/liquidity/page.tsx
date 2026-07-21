import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PoolExplorer } from "@/components/liquidity/pool-explorer";

export const metadata: Metadata = {
  title: "Liquidity Pools",
  description: "Discover Verdex liquidity pools — live WVDX, USDT and ALP pairs with transparent fees and variable LP yield.",
};

export default function LiquidityPage() {
  return (
    <div className="container pb-24 pt-28 lg:pt-32">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Liquidity <span className="text-gradient">Pools</span>
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            Provide liquidity to Verdex AMM pools and earn 0.17% of every trade.
            Yields vary with volume and are never guaranteed.
          </p>
        </div>
        <Link href="/liquidity/add">
          <Button size="lg"><Plus className="h-4 w-4" /> Add Liquidity</Button>
        </Link>
      </div>
      <PoolExplorer />
    </div>
  );
}
