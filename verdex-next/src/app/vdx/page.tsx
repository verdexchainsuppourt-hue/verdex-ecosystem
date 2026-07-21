import Link from "next/link";
import { VERDEX_CONSTANTS } from "@/lib/constants";
import { AlertTriangle, BookOpen, ExternalLink } from "lucide-react";

export const metadata = {
  title: "VDX Token",
  description: "Learn about the VDX token — Verdex's native utility and governance asset. Supply, allocation, staking tiers, and fee mechanics.",
};

export default function VDXPage() {
  const { vdx } = VERDEX_CONSTANTS;

  return (
    <div className="relative py-16">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-vdx-green/8 blur-[120px] pointer-events-none" />
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-8 relative space-y-14">

        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <svg viewBox="0 0 100 160" className="w-20 h-20 drop-shadow-[0_0_32px_rgba(36,229,150,0.6)] animate-float">
              <path d="M50 0L95 80L50 55L5 80L50 0Z" fill="#57FFB3" />
              <path d="M50 0L95 80L50 55L50 0Z" fill="#24E596" />
              <path d="M50 105L95 80L50 160L5 80L50 105Z" fill="#57FFB3" />
              <path d="M50 105L95 80L50 160L50 105Z" fill="#24E596" />
            </svg>
          </div>
          <span className="badge-pending mb-4">Pending Contract Deployment</span>
          <h1 className="font-heading text-5xl sm:text-6xl font-800 tracking-tight mb-4">
            <span className="gradient-text">VDX Token</span>
          </h1>
          <p className="text-vdx-muted text-lg max-w-xl mx-auto">
            The native utility and governance asset of the Verdex protocol. Fixed supply. Embedded in every layer of the ecosystem.
          </p>
        </div>

        {/* Status notice */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[rgba(245,185,66,0.08)] border border-[rgba(245,185,66,0.2)]">
          <AlertTriangle className="w-4 h-4 text-vdx-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm text-vdx-muted leading-relaxed">
            The VDX token contract has not yet been deployed. Verdex Points (VP) earned through mining will be convertible to VDX at the Token Generation Event (TGE) once audited contracts and independent validators are live. All figures below are from the Verdex Whitepaper v1.1.
          </p>
        </div>

        {/* Supply */}
        <div className="vdx-card p-8">
          <h2 className="font-heading font-bold text-xl mb-2">Total Fixed Supply</h2>
          <div className="font-heading font-800 text-5xl gradient-text mb-4">1,000,000,000 VDX</div>
          <p className="text-vdx-muted text-sm">Fixed supply. No inflationary minting. VDX is a fixed-supply PRC20 contract token released only from audited, timelocked allocation vaults.</p>
        </div>

        {/* Allocation */}
        <div className="vdx-card p-8">
          <h2 className="font-heading font-bold text-xl mb-6">Token Allocation</h2>
          {/* Visual bar */}
          <div className="flex h-8 rounded-xl overflow-hidden mb-6 gap-0.5">
            {vdx.allocation.map((a) => (
              <div
                key={a.label}
                style={{ width: `${a.pct}%`, background: a.color }}
                className="h-full transition-all"
                title={`${a.label}: ${a.pct}%`}
              />
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {vdx.allocation.map((a) => (
              <div key={a.label} className="flex items-center gap-3 p-3 rounded-xl bg-black/20">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: a.color }} />
                <span className="text-sm text-vdx-muted flex-1">{a.label}</span>
                <span className="font-mono font-bold text-vdx-text text-sm">{a.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Utility */}
        <div className="vdx-card p-8">
          <h2 className="font-heading font-bold text-xl mb-6">Token Utility</h2>
          <div className="space-y-3">
            {[
              { title: "Governance", desc: "Vote on fee structures, farm allocations, supported chains, treasury spending, and protocol upgrades." },
              { title: "Fee Reductions", desc: "Staked VDX reduces swap fees proportionally to your staking tier." },
              { title: "Farm Yield Boosts", desc: "Higher staking tiers multiply your LP farming reward rate." },
              { title: "Revenue Capture (Burn)", desc: "0.03% of every swap is used to market-buy VDX and burn it permanently, creating persistent buy pressure." },
              { title: "Launchpad Access", desc: "Staked VDX grants priority access to future token launches and ecosystem partnerships." },
            ].map((u) => (
              <div key={u.title} className="p-4 rounded-xl bg-vdx-green/4 border border-[rgba(87,255,179,0.08)]">
                <h3 className="font-semibold text-sm text-vdx-text mb-1">{u.title}</h3>
                <p className="text-xs text-vdx-muted leading-relaxed">{u.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Staking tiers */}
        <div className="vdx-card p-8">
          <h2 className="font-heading font-bold text-xl mb-6">Staking Tiers</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(87,255,179,0.1)]">
                  {["Tier", "VDX Required", "Swap Fee Discount", "Farm Boost"].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-xs text-vdx-green font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vdx.stakingTiers.map((t) => (
                  <tr key={t.tier} className="border-b border-[rgba(87,255,179,0.06)] hover:bg-vdx-green/4 transition-colors">
                    <td className="py-3 px-4 font-semibold text-vdx-text">{t.tier}</td>
                    <td className="py-3 px-4 font-mono text-vdx-muted">{t.required.toLocaleString()}+</td>
                    <td className="py-3 px-4 text-vdx-green font-semibold">{t.discount}%</td>
                    <td className="py-3 px-4 text-vdx-cyan font-semibold">{t.boost}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/whitepaper" className="btn-primary px-7 py-3.5">
            <BookOpen className="w-4 h-4" /> Full Whitepaper
          </Link>
          <Link href="/mining" className="btn-outline px-7 py-3.5">
            Start Earning VP
          </Link>
        </div>

        <p className="text-center text-xs text-vdx-muted">
          All data from Verdex Whitepaper v1.1 · July 2026 · Subject to governance and technical approval
        </p>
      </div>
    </div>
  );
}
