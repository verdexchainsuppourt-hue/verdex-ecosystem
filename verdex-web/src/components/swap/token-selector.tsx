"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TokenIcon } from "@/components/shared/token-icon";
import { TOKEN_LIST, TOKENS } from "@/lib/constants";
import { fmtToken } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TokenSelector({
  value,
  onChange,
  balances,
  exclude,
  label,
}: {
  value: string;
  onChange: (symbol: string) => void;
  balances?: Record<string, number>;
  exclude?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const token = TOKENS[value];

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOKEN_LIST.filter(
      (t) =>
        t.symbol !== exclude &&
        (!q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    );
  }, [query, exclude]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${token?.name ?? value}. Change token`}
        className="flex shrink-0 items-center gap-2 rounded-full border border-emerald/25 bg-emerald/[0.08] py-2 pl-2 pr-3 transition-all hover:border-emerald/50 hover:bg-emerald/[0.14] hover:shadow-glow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/60"
      >
        <TokenIcon symbol={value} size={26} />
        <span className="font-heading text-sm font-bold text-ink">{value}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or symbol"
              className="pl-10"
              aria-label="Search tokens"
              autoFocus
            />
          </div>
          <div className="-mx-2 max-h-[46vh] space-y-1 overflow-y-auto px-2">
            {list.length === 0 && (
              <p className="py-8 text-center text-sm text-muted">No tokens match “{query}”.</p>
            )}
            {list.map((t) => {
              const active = t.symbol === value;
              return (
                <button
                  key={t.symbol}
                  type="button"
                  onClick={() => { onChange(t.symbol); setOpen(false); setQuery(""); }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                    active ? "bg-emerald/10 border border-emerald/30" : "hover:bg-white/[0.04] border border-transparent"
                  )}
                >
                  <TokenIcon symbol={t.symbol} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{t.symbol}</span>
                    <span className="block truncate text-xs text-muted">{t.name}</span>
                  </span>
                  {balances && balances[t.symbol] !== undefined && (
                    <span className="mono text-xs text-muted">{fmtToken(balances[t.symbol])}</span>
                  )}
                  {active && <Check className="h-4 w-4 shrink-0 text-emerald-bright" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
