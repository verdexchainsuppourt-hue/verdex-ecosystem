"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NETWORKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** App-level network picker. `upcoming` networks are visible but marked. */
export function NetworkSelector({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = NETWORKS.find((n) => n.id === value) ?? NETWORKS[0];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="glass" size="sm" className={className} aria-label="Select network">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: current.color, boxShadow: `0 0 8px ${current.color}` }} />
          <span className="hidden sm:inline">{current.name}</span>
          <span className="sm:hidden">{current.shortName}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Networks</DropdownMenuLabel>
        {NETWORKS.map((n) => (
          <DropdownMenuItem
            key={n.id}
            disabled={n.upcoming}
            onClick={() => { onChange(n.id); setOpen(false); }}
            className={cn("flex items-center justify-between gap-6", n.upcoming && "opacity-50")}
          >
            <span className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: n.color }} />
              {n.name}
              {n.upcoming && <span className="rounded-full border border-line px-1.5 py-px text-[9px] uppercase tracking-wider text-faint">soon</span>}
            </span>
            {n.id === value && <Check className="h-4 w-4 text-emerald-bright" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-3 py-1.5 text-[11px] text-faint">Multi-chain routing arrives with mainnet expansion.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
