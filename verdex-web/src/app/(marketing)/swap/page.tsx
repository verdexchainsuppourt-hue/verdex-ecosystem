"use client";

import { ExternalLink } from "lucide-react";
import { SwapCard } from "@/components/swap/swap-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/shared/copy-button";
import { EmptyState } from "@/components/shared/states";
import { DemoBadge } from "@/components/shared/demo-badge";
import { TRANSACTIONS } from "@/lib/mock-data";
import { fmtUSD, shortHash } from "@/lib/format";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const statusTone: Record<string, string> = {
  confirmed: "text-emerald-bright border-emerald/30 bg-emerald/10",
  pending: "text-amber border-amber/30 bg-amber/10",
  failed: "text-danger border-danger/30 bg-danger/10",
};

export default function SwapPage() {
  const recent = TRANSACTIONS.filter((t) => t.type === "Swap");

  return (
    <div className="container grid gap-10 pb-24 pt-28 lg:grid-cols-[1fr_380px] lg:pt-32">
      {/* swap panel */}
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <Badge className="mb-4">0.25% fee · Self-custodial</Badge>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Swap on <span className="text-gradient">Verdex</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted">
            AMM aggregation with multi-hop routing across live WVDX, USDT and ALP pools.
          </p>
        </div>
        <SwapCard />
      </div>

      {/* side column */}
      <aside className="space-y-5">
        <Card className="edge-glow p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-base font-bold text-ink">Recent swaps</h2>
            <DemoBadge />
          </div>
          {recent.length === 0 ? (
            <EmptyState title="No swaps yet" description="Your recent swap activity will appear here." />
          ) : (
            <ul className="space-y-3">
              {recent.map((t) => (
                <li key={t.id} className="rounded-xl border border-line bg-black/25 p-3.5 transition-colors hover:border-emerald/30">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{t.summary}</span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", statusTone[t.status])}>
                      {t.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span className="mono">{fmtUSD(t.value)}</span>
                    <span>{t.time}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="mono text-[11px] text-faint">{shortHash(t.hash)}</code>
                    <CopyButton value={t.hash} label="Copy transaction hash" className="h-6 w-6" />
                    <a
                      href={`${LINKS.explorer}/tx/${t.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View in explorer"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-line text-faint transition-colors hover:border-emerald/40 hover:text-emerald-bright"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-heading text-base font-bold text-ink">How routing works</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            For every quote, the router evaluates direct pairs and multi-hop paths through the
            on-chain <code className="mono text-emerald-bright">findBestRoute</code> call and returns
            the path with the highest expected output. When a route resolves you&apos;ll see
            <span className="text-emerald-bright"> “Optimized route found”</span> with each hop listed.
          </p>
        </Card>
      </aside>
    </div>
  );
}
