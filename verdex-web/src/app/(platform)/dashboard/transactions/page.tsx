"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CopyButton } from "@/components/shared/copy-button";
import { DemoBadge } from "@/components/shared/demo-badge";
import { EmptyState } from "@/components/shared/states";
import { TRANSACTIONS } from "@/lib/mock-data";
import { fmtUSD, shortHash } from "@/lib/format";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TYPE_FILTERS = ["All", "Swap", "Mining", "Send", "Add", "Claim"] as const;
const statusTone: Record<string, string> = {
  confirmed: "text-emerald-bright border-emerald/30 bg-emerald/10",
  pending: "text-amber border-amber/30 bg-amber/10",
  failed: "text-danger border-danger/30 bg-danger/10",
};

export default function TransactionsPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]>("All");

  const txs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRANSACTIONS.filter((t) => {
      if (type !== "All" && t.type !== type) return false;
      if (q && !`${t.summary}${t.hash}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, type]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">Transactions</h1>
          <p className="mt-1 text-sm text-muted">Swaps, transfers, mining credits and payouts.</p>
        </div>
        <DemoBadge />
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search summary or hash…" className="pl-10" aria-label="Search transactions" />
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-black/25 p-1" role="group" aria-label="Filter by type">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                type === t ? "bg-emerald/15 text-emerald-bright" : "text-muted hover:text-ink"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      {txs.length === 0 ? (
        <EmptyState
          title="No transactions found"
          description="Try a different search or filter."
          action={<button onClick={() => { setQuery(""); setType("All"); }} className="text-sm font-semibold text-emerald-bright hover:underline">Clear filters</button>}
        />
      ) : (
        <>
          {/* desktop */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txs.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell><Badge variant="neutral">{t.type}</Badge></TableCell>
                    <TableCell className="max-w-[260px] truncate text-ink">{t.summary}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <code className="mono text-xs text-faint">{shortHash(t.hash)}</code>
                        <CopyButton value={t.hash} label="Copy hash" className="h-6 w-6" />
                        <a
                          href={`${LINKS.explorer}/tx/${t.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="View in explorer"
                          className="grid h-6 w-6 place-items-center rounded-md border border-line text-faint transition-colors hover:border-emerald/40 hover:text-emerald-bright"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </span>
                    </TableCell>
                    <TableCell className="mono text-right">{fmtUSD(t.value)}</TableCell>
                    <TableCell className="text-muted">{t.time}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", statusTone[t.status])}>{t.status}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* mobile */}
          <div className="grid gap-3 md:hidden">
            {txs.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="neutral">{t.type}</Badge>
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", statusTone[t.status])}>{t.status}</span>
                </div>
                <p className="mt-2.5 text-sm text-ink">{t.summary}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted">
                  <span className="mono">{fmtUSD(t.value)}</span>
                  <span>{t.time}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="mono text-[11px] text-faint">{shortHash(t.hash)}</code>
                  <CopyButton value={t.hash} label="Copy hash" className="h-6 w-6" />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
