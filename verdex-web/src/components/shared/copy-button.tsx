"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label ?? `Copy ${value}`}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white/[0.03] text-muted transition-all hover:border-emerald/40 hover:text-emerald-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/60",
        className
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-bright" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
