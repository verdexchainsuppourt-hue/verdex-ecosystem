"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TokenPairIcon } from "@/components/shared/token-icon";
import { RiskBadge } from "@/components/shared/risk-badge";
import { DemoBadge } from "@/components/shared/demo-badge";
import { EmptyState } from "@/components/shared/states";
import { NETWORKS, TOKENS } from "@/lib/constants";
import { POOLS } from "@/lib/mock-data";
import { fmtPct, fmtUSD } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Pool } from "@/lib/types";

type SortKey = "tvl" | "apy" | "volume24h" | "fees24h";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "tvl", label: "Liquidity" },
  { key: "volume24h", label: "Volume" },
  { key: "fees24h", label: "Fees" },
  { key: "apy", label: "Est. yield" },
];

const TYPE_FILTERS = ["All", "AMM", "Stable"] as const;

export function PoolExplorer() {
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("all");
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]>("All");
  const [sort, setSort] = useState<SortKey>("tvl");

  const pools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return POOLS.filter((p) => {
      if (network !== "all" && p.network !== network) return false;
      if (type !== "All" && p.type !== type) return false;
      if (q && !`${p.tokenA}${p.tokenB}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => b[sort] - a[sort]);
  }, [query, network, type, sort]);

  return (
    <div className="space-y-5">
      {/* filter bar */}
      <Card className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search token or pair…"
            className="pl-10"
            aria-label="Search pools"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line bg-black/25 p-1" role="group" aria-label="Network filter">
            <FilterPill active={network === "all"} onClick={() => setNetwork("all")}>All networks</FilterPill>
            {NETWORKS.filter((n) => !n.upcoming).map((n) => (
              <FilterPill key={n.id} active={network === n.id} onClick={() => setNetwork(n.id)}>{n.shortName}</FilterPill>
            ))}
          </div>
          <div className="flex rounded-xl border border-line bg-black/25 p-1" role="group" aria-label="Pool type filter">
            {TYPE_FILTERS.map((t) => (
              <FilterPill key={t} active={type === t} onClick={() => setType(t)}>{t}</FilterPill>
            ))}
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-line bg-black/25 p-1" role="group" aria-label="Sort pools">
            <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 text-faint" />
            {SORTS.map((s) => (
              <FilterPill key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>{s.label}</FilterPill>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-faint">{pools.length} pool{pools.length === 1 ? "" : "s"} · Yields are variable and not guaranteed.</p>
        <DemoBadge label="Demo values" />
      </div>

      {pools.length === 0 ? (
        <EmptyState
          title="No pools match your filters"
          description="Try a different token search or clear the network filter."
          action={<Button variant="outline" size="sm" onClick={() => { setQuery(""); setNetwork("all"); setType("All"); }}>Clear filters</Button>}
        />
      ) : (
        <>
          {/* desktop table */}
          <Card className="hidden overflow-hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pool</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Liquidity</TableHead>
                  <TableHead className="text-right">Volume 24h</TableHead>
                  <TableHead className="text-right">Fees 24h</TableHead>
                  <TableHead className="text-right">Fee tier</TableHead>
                  <TableHead className="text-right">Est. yield</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pools.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <TokenPairIcon a={p.tokenA} b={p.tokenB} size={30} />
                        <span>
                          <span className="block font-semibold text-ink">{p.tokenA} / {p.tokenB}</span>
                          <span className="text-xs text-faint">{NETWORKS.find((n) => n.id === p.network)?.name}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell><span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{p.type}</span></TableCell>
                    <TableCell className="mono text-right">{fmtUSD(p.tvl)}</TableCell>
                    <TableCell className="mono text-right">{fmtUSD(p.volume24h)}</TableCell>
                    <TableCell className="mono text-right text-emerald-bright">{fmtUSD(p.fees24h)}</TableCell>
                    <TableCell className="mono text-right">{p.feeTier}%</TableCell>
                    <TableCell className="mono text-right font-semibold text-emerald-bright">{fmtPct(p.apy)}</TableCell>
                    <TableCell><RiskBadge level={p.risk} /></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/liquidity/add?pool=${p.id}`}>
                        <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5" /> Add</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* mobile cards */}
          <div className="grid gap-4 lg:hidden">
            {pools.map((p) => (
              <Card key={p.id} glow className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <TokenPairIcon a={p.tokenA} b={p.tokenB} size={34} />
                    <span>
                      <span className="block font-heading font-bold text-ink">{p.tokenA} / {p.tokenB}</span>
                      <span className="text-xs text-faint">{p.type} · {p.feeTier}% fee</span>
                    </span>
                  </span>
                  <RiskBadge level={p.risk} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <Metric label="Liquidity" value={fmtUSD(p.tvl)} />
                  <Metric label="Volume" value={fmtUSD(p.volume24h)} />
                  <Metric label="Est. yield" value={fmtPct(p.apy)} accent />
                </div>
                <Link href={`/liquidity/add?pool=${p.id}`} className="mt-4 block">
                  <Button className="w-full" variant="outline"><Plus className="h-4 w-4" /> Add Liquidity</Button>
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
        active ? "bg-emerald/15 text-emerald-bright shadow-glow-sm" : "text-muted hover:text-ink"
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="rounded-xl border border-line bg-black/25 px-2 py-2.5">
      <span className="block text-[10px] uppercase tracking-wider text-faint">{label}</span>
      <span className={cn("mono mt-0.5 block text-sm font-semibold", accent ? "text-emerald-bright" : "text-mist")}>{value}</span>
    </span>
  );
}
