"use client";

import { motion } from "framer-motion";
import { Fuel } from "lucide-react";
import { TokenIcon } from "@/components/shared/token-icon";

/** Animated route path: Token A → Pool(s) → Token B. */
export function RouteVisual({ path, gas }: { path: string[]; gas?: string }) {
  if (path.length < 2) return null;
  return (
    <div className="rounded-xl border border-line bg-black/25 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Optimized route found
        </span>
        {gas && (
          <span className="flex items-center gap-1 text-[11px] text-faint">
            <Fuel className="h-3 w-3" /> ~{gas}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-y-2">
        {path.map((symbol, i) => (
          <span key={`${symbol}-${i}`} className="flex items-center">
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-elevate px-2.5 py-1">
              <TokenIcon symbol={symbol} size={16} />
              <span className="text-xs font-semibold text-ink">{symbol}</span>
            </span>
            {i < path.length - 1 && (
              <motion.span
                className="mx-1.5 h-px w-6 bg-gradient-to-r from-emerald/60 to-cyan/60"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: i * 0.12, duration: 0.3 }}
                style={{ transformOrigin: "left" }}
                aria-hidden="true"
              />
            )}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-faint">{path.length - 1} hop{path.length > 2 ? "s" : ""} · Verdex AMM pools</p>
    </div>
  );
}
