"use client";

import Link from "next/link";
import { ArrowRight, ArrowLeftRight, Droplets, Pickaxe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/shared/section-heading";
import { RevealGroup, RevealItem } from "@/components/shared/reveal";

const PRODUCTS = [
  {
    icon: ArrowLeftRight,
    title: "Trade",
    tagline: "Decentralized Swaps",
    description:
      "Swap supported tokens with self-custodial execution and optimized AMM routing across live WVDX, USDT and ALP pools.",
    benefit: "0.25% flat fee · multi-hop quotes",
    cta: { href: "/swap", label: "Open Swap" },
    status: { label: "Live quotes", tone: "default" as const },
    visual: (
      <div className="flex items-center gap-2 font-mono text-[11px] text-faint">
        <span className="rounded-md border border-line px-2 py-1 text-emerald-bright">WVDX</span>
        <span className="text-emerald">→</span>
        <span className="rounded-md border border-line px-2 py-1">USDT</span>
        <span className="text-emerald">→</span>
        <span className="rounded-md border border-line px-2 py-1 text-cyan">ALP</span>
      </div>
    ),
  },
  {
    icon: Droplets,
    title: "Liquidity",
    tagline: "Pools & LP Fees",
    description:
      "Provide liquidity, track pool information, and earn your share of the 0.17% LP fee on every trade — without giving up custody.",
    benefit: "Permissionless pools · variable yield",
    cta: { href: "/liquidity", label: "View Pools" },
    status: { label: "Pools live", tone: "default" as const },
    visual: (
      <div className="w-full space-y-1.5">
        {[82, 64, 45].map((w, i) => (
          <div key={i} className="h-1.5 rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-dim to-emerald" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Pickaxe,
    title: "Mine VDX",
    tagline: "DePIN Mining",
    description:
      "Download the Verdex miner for Windows, Android or Linux, authenticate with an API token, and earn Verdex Points for valid uptime.",
    benefit: "Windows v4.0.2 · Android v1.9.5 · Linux CLI",
    cta: { href: "/mining", label: "Mining Hub" },
    status: { label: "Miners live", tone: "cyan" as const },
    visual: (
      <div className="flex items-end gap-1.5" aria-hidden="true">
        {[10, 16, 8, 20, 14, 22, 12].map((h, i) => (
          <span key={i} className="w-2 rounded-sm bg-gradient-to-t from-emerald-dim to-emerald-bright animate-pulse" style={{ height: h * 2, animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    ),
  },
];

export function ProductTrio() {
  return (
    <section className="container py-24" aria-label="Verdex products">
      <SectionHeading
        tag="One Platform"
        title={<>Everything Verdex does, <span className="text-gradient">in one place.</span></>}
        description="Three products, one account, zero custody. Trade, provide liquidity, and mine VDX without leaving the ecosystem."
      />
      <RevealGroup className="mt-14 grid gap-5 md:grid-cols-3">
        {PRODUCTS.map((p) => (
          <RevealItem key={p.title}>
            <Card glow className="edge-glow group flex h-full flex-col gap-5 p-7 transition-transform duration-300 hover:-translate-y-1.5">
              <div className="flex items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald/25 bg-emerald/10 text-emerald-bright transition-shadow group-hover:shadow-glow-sm">
                  <p.icon className="h-6 w-6" />
                </span>
                <Badge variant={p.status.tone}>{p.status.label}</Badge>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-faint">{p.tagline}</p>
                <h3 className="mt-1.5 font-heading text-2xl font-bold text-ink">{p.title}</h3>
              </div>
              {p.visual}
              <p className="text-sm leading-relaxed text-muted">{p.description}</p>
              <p className="mt-auto text-xs font-medium text-emerald-bright/90">{p.benefit}</p>
              <Link
                href={p.cta.href}
                className="group/link inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-bright transition-colors hover:text-ink"
              >
                {p.cta.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover/link:translate-x-1" />
              </Link>
            </Card>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}
