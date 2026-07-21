"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

interface NumberTickerProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  compact?: boolean;
  className?: string;
}

function format(v: number, decimals: number, compact: boolean): string {
  const abs = Math.abs(v);
  if (compact && abs >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + "B";
  if (compact && abs >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (compact && abs >= 10_000) return (v / 1_000).toFixed(1) + "K";
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function NumberTicker({ value, decimals = 0, prefix = "", suffix = "", duration = 1.6, compact = false, className }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setDisplay(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduce]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {format(display, decimals, compact)}
      {suffix}
    </span>
  );
}
