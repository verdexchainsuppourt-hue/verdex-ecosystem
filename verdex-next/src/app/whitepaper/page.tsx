import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";
import { VERDEX_CONSTANTS } from "@/lib/constants";

export const metadata = { title: "Whitepaper v1.1" };

const SECTIONS = [
  { id: "abstract", label: "Abstract" },
  { id: "vision", label: "1. Vision & Mission" },
  { id: "market", label: "2. Market Context" },
  { id: "ecosystem", label: "3. The Ecosystem" },
  { id: "tokenomics", label: "4. Tokenomics" },
  { id: "architecture", label: "5. Architecture" },
  { id: "security", label: "6. Security" },
  { id: "governance", label: "7. Governance" },
  { id: "roadmap", label: "8. Roadmap" },
];

export default function WhitepaperPage() {
  return (
    <div className="py-16">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-10 relative">
          {/* Sticky sidebar TOC */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-24 glass rounded-xl p-5 space-y-1">
              <p className="text-xs text-vdx-green font-semibold uppercase tracking-widest mb-3">Contents</p>
              {SECTIONS.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="block text-xs text-vdx-muted hover:text-vdx-text py-1.5 hover:translate-x-1 transition-all duration-150">
                  {s.label}
                </a>
              ))}
              <div className="pt-3 mt-3 border-t border-[rgba(87,255,179,0.1)] space-y-2">
                <a href="/assets/verdex-whitepaper.pdf" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-vdx-green hover:text-vdx-bright">
                  <ExternalLink className="w-3 h-3" /> Download PDF
                </a>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 max-w-[720px] prose-custom">
            {/* Header */}
            <div className="text-center mb-16">
              <svg viewBox="0 0 100 160" className="w-16 h-16 mx-auto mb-5 drop-shadow-[0_0_24px_rgba(36,229,150,0.5)]">
                <path d="M50 0L95 80L50 55L5 80L50 0Z" fill="#57FFB3" />
                <path d="M50 0L95 80L50 55L50 0Z" fill="#24E596" />
                <path d="M50 105L95 80L50 160L5 80L50 105Z" fill="#57FFB3" />
                <path d="M50 105L95 80L50 160L50 105Z" fill="#24E596" />
              </svg>
              <h1 className="font-heading text-5xl font-800 tracking-tight gradient-text mb-2">Verdex Whitepaper</h1>
              <p className="text-vdx-muted text-sm font-mono">Version 1.1 · July 2026 · Pre-launch technical update</p>
            </div>

            {/* Abstract */}
            <section id="abstract" className="mb-12">
              <h2 className="font-heading text-2xl font-bold text-vdx-green border-b border-[rgba(87,255,179,0.1)] pb-3 mb-5">Abstract</h2>
              <p className="text-vdx-muted text-sm leading-relaxed mb-4">
                Verdex is a next-generation decentralized exchange (DEX) and DeFi ecosystem engineered to deliver institutional-grade liquidity infrastructure with consumer-grade simplicity. Inspired by proven AMM models, Verdex introduces a vertically integrated suite of products — Swap, Pool, Farm, and Stake — governed by the VERDEX (VDX) token.
              </p>
              <p className="text-vdx-muted text-sm leading-relaxed">
                This document presents the intended architecture, economic model, infrastructure stack, product logic, and strategic roadmap. <strong className="text-vdx-warning">This is a pre-launch technical document.</strong> The VDX token contract, public mainnet, swap execution, P2P market, bridge, and KYC intake are not yet live. A public launch requires a signed genesis, independently controlled validators, verified contract deployments, independent audits, and public release evidence.
              </p>
            </section>

            {/* Vision */}
            <section id="vision" className="mb-12">
              <h2 className="font-heading text-2xl font-bold text-vdx-green border-b border-[rgba(87,255,179,0.1)] pb-3 mb-5">1. Vision & Mission</h2>
              <div className="p-5 rounded-xl bg-vdx-green/6 border-l-4 border-vdx-green mb-5">
                <strong className="text-vdx-text">Mission:</strong>
                <span className="text-vdx-muted ml-2">Empower every user to swap tokens, supply liquidity, and earn yields with complete custody of their assets, while benefiting from low fees, deep liquidity, and a protocol that rewards long-term participation.</span>
              </div>
              <p className="text-vdx-muted text-sm leading-relaxed">
                Our vision is to build the most accessible, efficient, and sustainable decentralized trading ecosystem in crypto. Decentralized finance should not require a computer science degree to use, nor should it sacrifice user control for convenience.
              </p>
            </section>

            {/* Ecosystem */}
            <section id="ecosystem" className="mb-12">
              <h2 className="font-heading text-2xl font-bold text-vdx-green border-b border-[rgba(87,255,179,0.1)] pb-3 mb-5">3. The Verdex Ecosystem</h2>
              {[
                { title: "3.2 Verdex Swap", desc: "The primary interface for exchanging tokens. Routes trades through the most efficient paths using multi-hop evaluation and depth-weighted pricing. Constant product formula: x × y = k." },
                { title: "3.2 Verdex Pool", desc: "Liquidity pools hold reserves of two tokens. Depositors receive LP tokens entitling them to trading fee revenue (0.17% of 0.25% total fee)." },
                { title: "3.3 Verdex Farm", desc: "Farms allow LP token staking to earn VDX emissions above trading fees. Emissions decrease 10% per quarter for sustainability." },
                { title: "3.4 Verdex Stake", desc: "VDX staking grants governance power, fee discounts (10%–75%), and farm yield boosts (1.1x–2.5x) depending on staking tier." },
              ].map((s) => (
                <div key={s.title} className="mb-6">
                  <h3 className="font-heading font-bold text-base text-vdx-text mb-2">{s.title}</h3>
                  <p className="text-vdx-muted text-sm leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </section>

            {/* Tokenomics */}
            <section id="tokenomics" className="mb-12">
              <h2 className="font-heading text-2xl font-bold text-vdx-green border-b border-[rgba(87,255,179,0.1)] pb-3 mb-5">4. Tokenomics</h2>
              <p className="text-vdx-muted text-sm mb-4">Total fixed supply: <strong className="text-vdx-text font-mono">1,000,000,000 VDX</strong></p>
              <div className="flex h-8 rounded-xl overflow-hidden mb-4 gap-0.5">
                {VERDEX_CONSTANTS.vdx.allocation.map((a) => (
                  <div key={a.label} style={{ width: `${a.pct}%`, background: a.color }} className="h-full" title={`${a.label}: ${a.pct}%`} />
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-xs text-vdx-muted">
                {VERDEX_CONSTANTS.vdx.allocation.map((a) => (
                  <div key={a.label} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: a.color }} />
                    {a.label} — {a.pct}%
                  </div>
                ))}
              </div>
            </section>

            {/* Architecture */}
            <section id="architecture" className="mb-12">
              <h2 className="font-heading text-2xl font-bold text-vdx-green border-b border-[rgba(87,255,179,0.1)] pb-3 mb-5">5. Protocol Architecture</h2>
              <div className="space-y-3">
                {[
                  { name: "VerdexFactory", desc: "Deploys and indexes liquidity pair contracts using CREATE2 for deterministic addresses." },
                  { name: "VerdexPair", desc: "Holds token reserves, mints LP tokens, executes swaps, enforces constant product invariant, and supports flash swaps." },
                  { name: "VerdexRouter", desc: "Handles user-facing swap and liquidity operations with exact-input/output support, multi-hop routing, and slippage protection." },
                  { name: "FarmMaster", desc: "Manages LP token staking and VDX distribution using MasterChef-style reward debt accounting." },
                  { name: "StakingVault", desc: "Locks VDX tokens, tracks staking tiers, and distributes governance voting power." },
                  { name: "Governance", desc: "Time-locked proposal and execution system requiring minimum VDX stake to participate." },
                  { name: "Treasury", desc: "Multi-sig controlled vault receiving protocol fees and funding ecosystem growth." },
                ].map((c) => (
                  <div key={c.name} className="p-4 rounded-xl bg-black/20 border border-[rgba(87,255,179,0.08)]">
                    <span className="font-mono text-sm text-vdx-green font-bold">{c.name}</span>
                    <p className="text-xs text-vdx-muted mt-1">{c.desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 p-4 rounded-xl bg-[rgba(36,229,150,0.04)] border border-[rgba(87,255,179,0.1)]">
                <p className="text-xs text-vdx-muted"><strong className="text-vdx-text">Custom L1:</strong> Hyperledger Besu QBFT, proposed Chain ID 72010 (pending validator ceremony). Zero VDX consensus reward — VDX is released only from audited, timelocked allocation vaults.</p>
              </div>
            </section>

            {/* Security */}
            <section id="security" className="mb-12">
              <h2 className="font-heading text-2xl font-bold text-vdx-green border-b border-[rgba(87,255,179,0.1)] pb-3 mb-5">6. Security & Risk Management</h2>
              <ul className="space-y-2 text-sm text-vdx-muted">
                {[
                  "Third-party audits by at least two independent security firms before mainnet launch",
                  "Formal verification of critical invariants including constant product formula and LP token math",
                  "Public bug bounty program for responsible disclosure",
                  "Multi-day timelock on all administrative actions",
                  "Multi-signature treasury requiring multiple hardware-backed signers",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-vdx-green mt-1.5 flex-shrink-0" />{item}
                  </li>
                ))}
              </ul>
            </section>

            {/* Governance */}
            <section id="governance" className="mb-12">
              <h2 className="font-heading text-2xl font-bold text-vdx-green border-b border-[rgba(87,255,179,0.1)] pb-3 mb-5">7. Governance</h2>
              <p className="text-vdx-muted text-sm leading-relaxed mb-4">Verdex will progressively decentralize into a community-governed DAO. VDX stakers propose and vote on: fee tier adjustments, farm allocation points, new chain deployments, treasury spending, and contract upgrades. Proposals require minimum quorum and majority vote before time-locked execution.</p>
            </section>

            {/* Roadmap */}
            <section id="roadmap" className="mb-12">
              <h2 className="font-heading text-2xl font-bold text-vdx-green border-b border-[rgba(87,255,179,0.1)] pb-3 mb-5">8. Roadmap</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[rgba(87,255,179,0.1)]">
                      {["Phase", "Milestone", "Status"].map((h) => (
                        <th key={h} className="text-left py-3 px-4 text-xs text-vdx-green font-semibold uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {VERDEX_CONSTANTS.roadmap.map((r) => (
                      <tr key={r.phase} className="border-b border-[rgba(87,255,179,0.06)]">
                        <td className="py-3 px-4 font-mono text-xs text-vdx-muted whitespace-nowrap">{r.phase}</td>
                        <td className="py-3 px-4 text-sm text-vdx-muted">{r.title}</td>
                        <td className="py-3 px-4">
                          <span className={`text-xs font-semibold ${r.status === "completed" ? "text-vdx-green" : r.status === "active" ? "text-vdx-warning" : "text-vdx-muted"}`}>
                            {r.status === "completed" ? "Completed" : r.status === "active" ? "In Progress" : r.status === "planned" ? "Planned" : "Research"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Disclaimer */}
            <div className="p-5 rounded-xl bg-black/20 border border-[rgba(87,255,179,0.08)] text-xs text-vdx-muted leading-relaxed">
              <strong>Disclaimer:</strong> This whitepaper is for informational purposes only and does not constitute financial, legal, or investment advice. All specifications, allocations, and timelines remain subject to signed technical, security, operational, and regulatory approvals. Developed by Suleman.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
