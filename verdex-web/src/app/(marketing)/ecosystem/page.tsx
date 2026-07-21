"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeftRight, ArrowRight, Droplets, LayoutDashboard, Pickaxe, RefreshCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal } from "@/components/shared/reveal";
import { VerdexMark } from "@/components/shared/logo";

const NODES = [
  {
    icon: ArrowLeftRight,
    title: "Traders",
    text: "Swap tokens through the AMM aggregator with multi-hop routing.",
    href: "/swap",
    cta: "Swap",
  },
  {
    icon: Droplets,
    title: "Liquidity Providers",
    text: "Supply the pools that make those swaps possible and earn 0.17% of every trade.",
    href: "/liquidity",
    cta: "Pools",
  },
  {
    icon: Pickaxe,
    title: "Miners",
    text: "Contribute uptime to the DePIN pool and earn VP, convertible to VDX.",
    href: "/mining",
    cta: "Mine",
  },
  {
    icon: LayoutDashboard,
    title: "One Dashboard",
    text: "Every role managed from a single account: wallet, mining, rewards, transactions.",
    href: "/dashboard",
    cta: "Open",
  },
];

/** Animated circular flow diagram of how value moves through Verdex. */
function FlowDiagram() {
  const items = [
    { label: "Swap", angle: 0 },
    { label: "Pools", angle: 90 },
    { label: "Farms", angle: 180 },
    { label: "Mining", angle: 270 },
  ];
  const R = 120;
  return (
    <div className="relative mx-auto h-[300px] w-[300px] sm:h-[360px] sm:w-[360px]" role="img" aria-label="Verdex ecosystem flow diagram">
      {/* rotating ring */}
      <motion.span
        className="absolute inset-4 rounded-full border border-emerald/20"
        animate={{ rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        style={{ borderStyle: "dashed" }}
      />
      <motion.span
        className="absolute inset-12 rounded-full border border-cyan/15"
        animate={{ rotate: -360 }}
        transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
      />
      {/* traveling pulse */}
      <motion.span
        className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full bg-emerald-bright shadow-glow"
        animate={{
          x: [0, R, 0, -R, 0],
          y: [-R, 0, R, 0, -R],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        style={{ marginLeft: -5, marginTop: -5 }}
      />
      {/* center */}
      <div className="absolute left-1/2 top-1/2 grid h-28 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-emerald/30 bg-elevate shadow-glow">
        <VerdexMark className="h-12 w-8" />
      </div>
      {/* nodes */}
      {items.map((n) => {
        const rad = (n.angle * Math.PI) / 180;
        const x = Math.cos(rad) * R;
        const y = Math.sin(rad) * R;
        return (
          <motion.div
            key={n.label}
            className="absolute left-1/2 top-1/2"
            style={{ x: x - 44, y: y - 20 }}
            initial={{ opacity: 0, scale: 0.7 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 * (n.angle / 90), duration: 0.5 }}
          >
            <span className="grid w-[88px] place-items-center rounded-xl border border-line bg-elevate/90 px-3 py-2 text-center shadow-card backdrop-blur-md">
              <span className="text-xs font-bold text-emerald-bright">{n.label}</span>
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function EcosystemPage() {
  return (
    <div className="container pb-24 pt-28 lg:pt-32">
      <SectionHeading
        tag="Ecosystem"
        title={<>How every part of Verdex <span className="text-gradient">connects.</span></>}
        description="Traders, liquidity providers, and miners reinforce each other in one loop — coordinated by a single self-custodial account."
      />

      <Reveal className="mt-14">
        <FlowDiagram />
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted">
          <RefreshCcw className="h-4 w-4 text-emerald" />
          Fees flow to LPs · emissions to farms · VP to miners · VDX ties it together
        </p>
      </Reveal>

      <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {NODES.map((n) => (
          <Card key={n.title} glow className="edge-glow flex h-full flex-col gap-3 p-6">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-emerald/25 bg-emerald/10 text-emerald-bright">
              <n.icon className="h-5 w-5" />
            </span>
            <h2 className="font-heading text-lg font-bold text-ink">{n.title}</h2>
            <p className="text-sm leading-relaxed text-muted">{n.text}</p>
            <Link href={n.href} className="group mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-bright">
              {n.cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Card>
        ))}
      </div>

      {/* the loop explained */}
      <Reveal className="mt-16">
        <Card className="p-8 lg:p-10">
          <h2 className="font-heading text-2xl font-bold text-ink">The value loop</h2>
          <ol className="mt-6 space-y-5">
            {[
              ["Users trade tokens", "Swaps execute against AMM pools through optimized routes — a 0.25% fee applies to each trade."],
              ["Liquidity providers support swaps", "LPs deposit pairs and continuously earn 0.17% of trade volume in their pools."],
              ["Aggregation optimizes routes", "The router compares direct and multi-hop paths on-chain and selects the highest-output route."],
              ["Miners earn VDX by protocol rules", "Valid heartbeats earn VP off-chain; VP converts to VDX at payout finality."],
              ["One dashboard manages it all", "Balances, workers, rewards, wallet and transactions — a single account view."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-emerald/30 bg-emerald/10 font-mono text-xs font-bold text-emerald-bright">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-ink">{t}</p>
                  <p className="mt-0.5 text-sm text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </Reveal>
    </div>
  );
}
