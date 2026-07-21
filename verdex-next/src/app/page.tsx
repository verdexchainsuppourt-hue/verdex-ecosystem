"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import {
  Zap, Droplets, Pickaxe, ArrowRight, Shield, TrendingUp,
  Link2, ChevronRight, Download, BookOpen, ExternalLink,
  CheckCircle2, Clock, FlaskConical
} from "lucide-react";
import { VERDEX_CONSTANTS } from "@/lib/constants";
import { HeroFallback } from "@/components/three/hero-fallback";

// Lazy-load 3D scene — only on desktop/WebGL capable
const VerdexHero3D = dynamic(
  () => import("@/components/three/verdex-hero-3d").then((m) => ({ default: m.VerdexHero3D })),
  {
    ssr: false,
    loading: () => <HeroFallback />,
  }
);

// ─── Animation variants ────────────────────────────────────────────────────
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.1 } },
};

// ─── Status map ───────────────────────────────────────────────────────────
const statusLabel = {
  completed: { label: "Completed", icon: CheckCircle2, cls: "text-vdx-green" },
  active: { label: "In Progress", icon: Clock, cls: "text-vdx-warning" },
  planned: { label: "Planned", icon: ArrowRight, cls: "text-vdx-muted" },
  research: { label: "Research", icon: FlaskConical, cls: "text-vdx-cyan" },
};

export default function HomePage() {
  return (
    <div className="relative">
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden grid-bg">
        {/* Background glow blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-vdx-green/8 blur-[120px]" />
          <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-vdx-cyan/6 blur-[100px]" />
        </div>

        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 w-full py-20">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Left: content */}
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="max-w-xl"
            >
              {/* Badge */}
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2 mb-6">
                <span className="pulse-dot" />
                <span className="text-xs font-semibold tracking-widest uppercase text-vdx-green font-mono">
                  Next-Generation Decentralized Ecosystem
                </span>
              </motion.div>

              {/* Headline */}
              <motion.h1
                variants={fadeUp}
                className="font-heading text-5xl sm:text-6xl lg:text-7xl font-800 leading-[1.0] tracking-tight mb-6"
              >
                <span className="gradient-text">Swap Smart.</span>
                <br />
                <span className="text-vdx-text">Grow Green.</span>
                <br />
                <span className="text-vdx-muted text-4xl sm:text-5xl lg:text-6xl">Mine DePIN.</span>
              </motion.h1>

              {/* Description */}
              <motion.p variants={fadeUp} className="text-vdx-muted text-lg leading-relaxed mb-8 max-w-md">
                Verdex combines decentralized token swaps, intelligent AMM routing, liquidity tools and the VDX DePIN mining ecosystem in one self-custodial platform.
              </motion.p>

              {/* CTA buttons */}
              <motion.div variants={fadeUp} className="flex flex-wrap gap-3 mb-10">
                <Link href="/swap" className="btn-primary text-base px-6 py-3.5">
                  <Zap className="w-4 h-4" />
                  Launch Swap
                </Link>
                <Link href="/mining" className="btn-outline text-base px-6 py-3.5">
                  <Pickaxe className="w-4 h-4" />
                  Start Mining
                </Link>
                <Link href="/whitepaper" className="btn-outline text-base px-6 py-3.5 text-vdx-muted border-vdx/60">
                  <BookOpen className="w-4 h-4" />
                  Whitepaper
                </Link>
              </motion.div>

              {/* Live stats */}
              <motion.div variants={fadeUp} className="flex items-center gap-6 flex-wrap">
                {[
                  { label: "Windows Miner", value: "v4.0.2", live: true },
                  { label: "Android Miner", value: "v1.10.0", live: true },
                  { label: "AMM Quotes", value: "Live", live: true },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col">
                    <span className="font-mono text-sm font-bold text-vdx-green">{stat.value}</span>
                    <span className="text-xs text-vdx-muted mt-0.5">{stat.label}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* Right: 3D visual */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              className="relative h-[400px] lg:h-[520px] hidden sm:block"
            >
              <VerdexHero3D />
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="text-xs text-vdx-muted">Scroll to explore</span>
          <div className="w-px h-10 bg-gradient-to-b from-vdx-green/60 to-transparent animate-float" />
        </motion.div>
      </section>

      {/* ── PRODUCT OVERVIEW ──────────────────────────────────────────────── */}
      <section className="py-24 bg-vdx-section">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.span variants={fadeUp} className="section-tag">Products</motion.span>
            <motion.h2 variants={fadeUp} className="font-heading text-4xl sm:text-5xl font-800 tracking-tight mt-3 mb-4">
              One Ecosystem.{" "}
              <span className="gradient-text">Three Core Products.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-vdx-muted text-lg max-w-2xl mx-auto">
              Trade tokens, supply liquidity, and mine VDX — all from a single self-custodial platform.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger}
            className="grid md:grid-cols-3 gap-6"
          >
            {[
              {
                icon: Zap,
                number: "01",
                title: "Trade",
                subtitle: "Verdex Swap",
                desc: "Execute token swaps using the decentralized AMM aggregator with intelligent multi-hop routing and constant-product pricing.",
                features: ["Constant product x×y=k", "Multi-hop routing", "0.25% total fee"],
                cta: "Open Swap",
                href: "/swap",
                status: "AMM quotes live",
                statusType: "live" as const,
                gradient: "from-vdx-green/10 to-vdx-cyan/5",
              },
              {
                icon: Droplets,
                number: "02",
                title: "Liquidity",
                subtitle: "Verdex Pool",
                desc: "Provide liquidity to token pairs, receive LP tokens, and earn a proportional share of all swap fees generated by the pool.",
                features: ["0.17% fee to LPs", "LP token receipt", "Permissionless pools"],
                cta: "View Pools",
                href: "/liquidity",
                status: "Coming soon",
                statusType: "soon" as const,
                gradient: "from-vdx-cyan/10 to-vdx-blue/5",
              },
              {
                icon: Pickaxe,
                number: "03",
                title: "Mine VDX",
                subtitle: "DePIN Mining",
                desc: "Download the Verdex CLI miner, connect it to your account, and earn Verdex Points (VP) by contributing compute resources to the network.",
                features: ["Windows & Android apps", "CPU/GPU mining", "VP rewards system"],
                cta: "Start Mining",
                href: "/mining",
                status: "Miners live",
                statusType: "live" as const,
                gradient: "from-vdx-warning/8 to-vdx-green/5",
              },
            ].map((card) => (
              <motion.div
                key={card.title}
                variants={fadeUp}
                className="vdx-card p-7 group relative overflow-hidden"
              >
                {/* Number */}
                <span className="absolute top-6 right-6 font-heading font-800 text-5xl text-vdx-green/6 select-none">
                  {card.number}
                </span>

                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.gradient} border border-[rgba(87,255,179,0.15)] flex items-center justify-center mb-5`}>
                  <card.icon className="w-5 h-5 text-vdx-green" />
                </div>

                {/* Status */}
                <div className="mb-3">
                  {card.statusType === "live" ? (
                    <span className="badge-live text-[10px]"><span className="pulse-dot w-1.5 h-1.5" />{card.status}</span>
                  ) : (
                    <span className="badge-soon text-[10px]">{card.status}</span>
                  )}
                </div>

                <h3 className="font-heading font-bold text-xl text-vdx-text mb-1">{card.title}</h3>
                <p className="text-vdx-green text-xs font-mono mb-3">{card.subtitle}</p>
                <p className="text-vdx-muted text-sm leading-relaxed mb-5">{card.desc}</p>

                <ul className="space-y-1.5 mb-6">
                  {card.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-vdx-muted">
                      <span className="w-1.5 h-1.5 rounded-full bg-vdx-green flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={card.href}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-vdx-green hover:text-vdx-bright transition-colors group-hover:gap-2.5 duration-200"
                >
                  {card.cta}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.span variants={fadeUp} className="section-tag">Mechanics</motion.span>
            <motion.h2 variants={fadeUp} className="font-heading text-4xl sm:text-5xl font-800 tracking-tight mt-3">
              How Verdex <span className="gradient-text">Works</span>
            </motion.h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-10">
            {/* Swapping */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="vdx-card p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <Zap className="w-5 h-5 text-vdx-green" />
                <h3 className="font-heading font-bold text-lg">Swapping Tokens</h3>
              </div>
              {[
                { step: 1, title: "Connect Your Wallet", desc: "Link any EIP-1193 wallet. No signup required for swaps." },
                { step: 2, title: "Choose Tokens & Amount", desc: "Select token in and token out. Set slippage tolerance." },
                { step: 3, title: "Smart Route Execution", desc: "The router evaluates direct pairs and multi-hop paths." },
                { step: 4, title: "Receive Tokens", desc: "Approve the atomic transaction. Receive tokens minus 0.25% fee." },
              ].map((s) => (
                <div key={s.step} className="flex gap-4 mb-5 last:mb-0">
                  <div className="w-7 h-7 rounded-full bg-vdx-green/15 border border-vdx-green/30 flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold text-vdx-green">
                    {s.step}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-vdx-text mb-1">{s.title}</h4>
                    <p className="text-xs text-vdx-muted leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Mining */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="vdx-card p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <Pickaxe className="w-5 h-5 text-vdx-green" />
                <h3 className="font-heading font-bold text-lg">Mining VDX</h3>
              </div>
              {[
                { step: 1, title: "Create Your Account", desc: "Register on the Verdex platform with email and password." },
                { step: 2, title: "Download the Miner", desc: "Get the official Verdex Miner for Windows (v4.0.2) or Android (v1.10.0)." },
                { step: 3, title: "Authenticate & Connect", desc: "Generate a miner token in your dashboard and connect the app." },
                { step: 4, title: "Track Rewards", desc: "Monitor your hash rate, VP balance, and reward history in real time." },
              ].map((s) => (
                <div key={s.step} className="flex gap-4 mb-5 last:mb-0">
                  <div className="w-7 h-7 rounded-full bg-vdx-green/15 border border-vdx-green/30 flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold text-vdx-green">
                    {s.step}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-vdx-text mb-1">{s.title}</h4>
                    <p className="text-xs text-vdx-muted leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
              <Link
                href="/mining"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-vdx-green mt-4 hover:text-vdx-bright transition-colors"
              >
                Start Mining <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          </div>

          {/* Fee structure */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 vdx-card p-8"
          >
            <h3 className="font-heading font-bold text-lg mb-6 text-center">Fee Structure Per Swap</h3>
            <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto">
              {[
                { pct: "0.17%", label: "Liquidity Providers", color: "vdx-green" },
                { pct: "0.05%", label: "Protocol Treasury", color: "vdx-cyan" },
                { pct: "0.03%", label: "VDX Buyback & Burn", color: "vdx-blue" },
              ].map((f) => (
                <div key={f.label} className="text-center p-4 rounded-xl bg-[rgba(36,229,150,0.04)] border border-[rgba(87,255,179,0.1)]">
                  <div className="font-mono text-2xl font-bold text-vdx-green mb-1">{f.pct}</div>
                  <div className="text-xs text-vdx-muted">{f.label}</div>
                </div>
              ))}
            </div>
            <p className="text-center text-vdx-muted text-sm mt-4">
              Total swap fee: <strong className="text-vdx-text font-mono">0.25%</strong>
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── PLATFORM FEATURES ─────────────────────────────────────────────── */}
      <section className="py-24 bg-vdx-section">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.span variants={fadeUp} className="section-tag">Why Verdex</motion.span>
            <motion.h2 variants={fadeUp} className="font-heading text-4xl sm:text-5xl font-800 tracking-tight mt-3">
              Built for <span className="gradient-text">Real Users</span>
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5"
          >
            {[
              { icon: Zap, title: "Optimized Routing", desc: "Multi-hop AMM routing finds the best path for every trade across all available liquidity." },
              { icon: Shield, title: "Self-Custodial", desc: "Your keys, your crypto. Verdex never holds your funds. Every swap is on-chain and verifiable." },
              { icon: Pickaxe, title: "DePIN Mining", desc: "Contribute CPU/GPU resources to earn VP rewards — no specialized hardware required." },
              { icon: Link2, title: "Green EVM L1", desc: "Built on a PoA Hyperledger Besu network with near-zero energy consumption and fast finality." },
            ].map((f, i) => (
              <motion.div key={f.title} variants={fadeUp} className="vdx-card p-6">
                <div className="w-10 h-10 rounded-xl bg-vdx-green/10 border border-vdx-green/20 flex items-center justify-center mb-4">
                  <f.icon className="w-4.5 h-4.5 text-vdx-green" />
                </div>
                <h3 className="font-heading font-bold text-base mb-2">{f.title}</h3>
                <p className="text-vdx-muted text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── ROADMAP PREVIEW ───────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12"
          >
            <div>
              <motion.span variants={fadeUp} className="section-tag">Roadmap</motion.span>
              <motion.h2 variants={fadeUp} className="font-heading text-4xl sm:text-5xl font-800 tracking-tight mt-3">
                The Path to <span className="gradient-text">Mainnet</span>
              </motion.h2>
            </div>
            <motion.div variants={fadeUp}>
              <Link href="/roadmap" className="btn-outline text-sm px-5 py-2.5">
                Full Roadmap <ChevronRight className="w-4 h-4" />
              </Link>
            </motion.div>
          </motion.div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-vdx-green/40 via-vdx-green/20 to-transparent hidden sm:block" />

            <div className="space-y-4">
              {VERDEX_CONSTANTS.roadmap.map((item, i) => {
                const { label, icon: Icon, cls } = statusLabel[item.status];
                return (
                  <motion.div
                    key={item.phase}
                    initial={{ opacity: 0, x: -24 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.08 }}
                    className={`sm:pl-12 relative vdx-card p-6 ${item.status === "active" ? "border-vdx-green/30" : ""}`}
                  >
                    {/* Dot */}
                    <div className={`absolute left-[9px] top-7 w-3 h-3 rounded-full border-2 hidden sm:block ${item.status === "completed" ? "bg-vdx-green border-vdx-green" : item.status === "active" ? "bg-vdx-warning border-vdx-warning" : "bg-vdx-bg border-vdx-muted/40"}`} />

                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <span className="text-xs font-mono text-vdx-muted">{item.phase}</span>
                        <h3 className="font-heading font-bold text-lg mt-1">{item.title}</h3>
                        <p className="text-vdx-muted text-sm leading-relaxed mt-2 max-w-2xl">{item.description}</p>
                      </div>
                      <div className={`flex items-center gap-1.5 text-xs font-semibold ${cls} flex-shrink-0`}>
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── DOWNLOAD CTA ─────────────────────────────────────────────────── */}
      <section className="py-24 bg-vdx-section">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative vdx-card p-10 sm:p-14 text-center overflow-hidden"
          >
            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-vdx-green/8 via-transparent to-vdx-cyan/5 pointer-events-none" />

            <span className="section-tag mb-4 block">Start Mining Today</span>
            <h2 className="font-heading text-4xl sm:text-5xl font-800 tracking-tight mb-4">
              Download <span className="gradient-text">Verdex Miner</span>
            </h2>
            <p className="text-vdx-muted text-lg max-w-xl mx-auto mb-10">
              Download the official Verdex Miner app, authenticate with your account, and start earning VP rewards.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <a
                href="/updates/Verdex-Miner-Setup-4.0.2.exe"
                className="btn-primary text-base px-8 py-4 w-full sm:w-auto"
              >
                <Download className="w-4 h-4" />
                🪟 Windows Miner v4.0.2
              </a>
              <a
                href="/assets/downloads/Verdex-Android-1.10.0-build47.apk"
                className="btn-outline text-base px-8 py-4 w-full sm:w-auto"
              >
                🤖 Android APK v1.10.0
              </a>
              <Link href="/dashboard/downloads" className="btn-outline text-base px-8 py-4 w-full sm:w-auto text-vdx-muted border-vdx/50">
                🐧 Linux CLI
              </Link>
            </div>

            <p className="text-xs text-vdx-muted">
              Only download the Verdex Miner from{" "}
              <span className="font-mono text-vdx-green">verdexswap.site</span>
              {" · "}
              Verify file checksums before running
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ PREVIEW ───────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-12"
          >
            <motion.span variants={fadeUp} className="section-tag">FAQ</motion.span>
            <motion.h2 variants={fadeUp} className="font-heading text-4xl sm:text-5xl font-800 tracking-tight mt-3">
              Common <span className="gradient-text">Questions</span>
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="space-y-3"
          >
            {[
              { q: "What is Verdex?", a: "Verdex is a next-generation green EVM blockchain ecosystem featuring a decentralized AMM swap, liquidity pools, and a DePIN CPU/GPU mining system for earning VDX rewards." },
              { q: "Does Verdex hold user funds?", a: "No. Verdex is fully self-custodial. Your wallet keys remain with you at all times. Every swap is executed directly on-chain through verifiable smart contracts." },
              { q: "How does VDX mining work?", a: "Download the Verdex Miner app (Windows or Android), create an account, generate a miner token, and connect your app. The miner contributes your idle CPU/GPU resources to the DePIN network and earns Verdex Points (VP) — your pre-TGE mining balance." },
              { q: "What is the 0.25% swap fee used for?", a: "The fee is split: 0.17% goes to liquidity providers, 0.05% goes to the protocol treasury, and 0.03% is used to buy and permanently burn VDX tokens." },
              { q: "Are yields guaranteed?", a: "No. All yields from liquidity provision and mining are variable and depend on swap volume, pool size, network activity, and protocol emissions. Cryptocurrency involves substantial risk." },
            ].map((item, i) => (
              <motion.details
                key={i}
                variants={fadeUp}
                className="vdx-card p-5 group open:border-vdx-green/25 cursor-pointer"
              >
                <summary className="flex items-center justify-between font-semibold text-vdx-text text-sm select-none list-none">
                  {item.q}
                  <ChevronRight className="w-4 h-4 text-vdx-muted transition-transform duration-200 group-open:rotate-90 flex-shrink-0" />
                </summary>
                <p className="text-vdx-muted text-sm leading-relaxed mt-3">{item.a}</p>
              </motion.details>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mt-8"
          >
            <Link href="/faq" className="btn-outline text-sm px-6 py-2.5">
              View All FAQs <ChevronRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── WHITEPAPER CTA ────────────────────────────────────────────────── */}
      <section className="py-20 bg-vdx-section">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col md:flex-row items-center justify-between gap-8 vdx-card p-8 sm:p-10"
          >
            <div>
              <span className="section-tag mb-2 block">Documentation</span>
              <h2 className="font-heading text-3xl font-800 tracking-tight">
                Read the <span className="gradient-text">Whitepaper</span>
              </h2>
              <p className="text-vdx-muted mt-3 max-w-md text-sm leading-relaxed">
                Explore the full Verdex technical architecture, tokenomics, AMM mechanics, mining system, and roadmap in our comprehensive whitepaper v1.1.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
              <Link href="/whitepaper" className="btn-primary px-6 py-3.5">
                <BookOpen className="w-4 h-4" /> Read Online
              </Link>
              <a
                href="/assets/verdex-whitepaper.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline px-6 py-3.5"
              >
                <ExternalLink className="w-4 h-4" /> Download PDF
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
