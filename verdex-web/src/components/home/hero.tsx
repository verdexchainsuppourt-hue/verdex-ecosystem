"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BookOpen, Droplets, Pickaxe, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroCrystal } from "@/components/three/hero-crystal";

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const reduce = useReducedMotion();
  const glowRef = useRef<HTMLDivElement>(null);

  function onMouseMove(e: React.MouseEvent<HTMLElement>) {
    const el = glowRef.current;
    if (!el || reduce) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.style.background = `radial-gradient(520px circle at ${e.clientX - rect.left}px ${e.clientY - rect.top}px, rgba(36,229,150,0.07), transparent 65%)`;
  }

  return (
    <section
      className="relative flex min-h-[100svh] items-center overflow-hidden pt-[68px]"
      onMouseMove={onMouseMove}
      aria-label="Verdex hero"
    >
      {/* mouse-follow glow */}
      <div ref={glowRef} className="pointer-events-none absolute inset-0 transition-[background] duration-200" aria-hidden="true" />

      <div className="container grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-8">
        {/* copy */}
        <div>
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="inline-flex items-center gap-2.5 rounded-full border border-emerald/25 bg-emerald/[0.07] px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-bright"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse-dot" />
            Next-Generation Decentralized Ecosystem
          </motion.span>

          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.1, ease }}
            className="mt-7 font-heading text-[2.6rem] font-bold leading-[1.04] tracking-tight text-ink sm:text-6xl lg:text-[4.2rem] text-balance"
          >
            Swap Smart. <span className="text-gradient">Build Liquidity.</span> Mine VDX.
          </motion.h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.22, ease }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-muted"
          >
            Verdex combines decentralized token swaps, intelligent routing, liquidity tools
            and the VDX mining ecosystem in one self-custodial platform.
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.34, ease }}
            className="mt-9 flex flex-wrap items-center gap-3.5"
          >
            <Link href="/dashboard">
              <Button size="lg">
                <Rocket className="h-4.5 w-4.5 h-[18px] w-[18px]" /> Launch Verdex
              </Button>
            </Link>
            <Link href="/mining">
              <Button size="lg" variant="outline">
                <Pickaxe className="h-[18px] w-[18px]" /> Start Mining
              </Button>
            </Link>
            <div className="flex items-center gap-5 pl-1 text-sm">
              <Link href="/liquidity" className="group inline-flex items-center gap-1.5 font-medium text-muted transition-colors hover:text-emerald-bright">
                <Droplets className="h-4 w-4" /> Explore Liquidity
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/whitepaper" className="group inline-flex items-center gap-1.5 font-medium text-muted transition-colors hover:text-emerald-bright">
                <BookOpen className="h-4 w-4" /> Read Whitepaper
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-10 inline-flex items-center gap-2.5 rounded-full border border-line bg-black/30 px-4 py-2 text-xs text-muted"
          >
            <span className="h-2 w-2 rounded-full bg-emerald animate-pulse-dot" />
            Verdex Platform Online
            <span className="text-faint">· visual indicator</span>
          </motion.div>
        </div>

        {/* 3D crystal */}
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.25, ease }}
          className="relative h-[420px] sm:h-[500px] lg:h-[560px]"
        >
          <HeroCrystal />
        </motion.div>
      </div>

      {/* bottom fade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-abyss to-transparent" aria-hidden="true" />
    </section>
  );
}
