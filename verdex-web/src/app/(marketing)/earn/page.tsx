import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Droplets, Pickaxe, Sprout, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal, RevealGroup, RevealItem } from "@/components/shared/reveal";
import { DemoBadge } from "@/components/shared/demo-badge";
import { TokenPairIcon } from "@/components/shared/token-icon";
import { POOLS } from "@/lib/mock-data";
import { fmtPct, fmtUSD } from "@/lib/format";

export const metadata: Metadata = {
  title: "Earn",
  description: "Ways to earn in the Verdex ecosystem — LP trading fees, VDX mining rewards, and referrals. Variable, never guaranteed.",
};

const METHODS = [
  {
    icon: Droplets,
    title: "Liquidity-Provider Fees",
    source: "0.17% of every swap in your pool",
    description: "Deposit into a pool and earn a proportional share of trading fees, auto-compounded into the pool.",
    reward: "LP tokens accrue fees in the pair's tokens",
    lock: "No lock — withdraw anytime",
    risk: "Impermanent loss if the price ratio moves",
    cta: { href: "/liquidity", label: "Browse pools" },
    status: "Live",
  },
  {
    icon: Pickaxe,
    title: "VDX Mining Rewards",
    source: "DePIN heartbeat credits",
    description: "Run the Verdex miner (Windows / Android / Linux) and earn Verdex Points (VP) for valid uptime, convertible to VDX at payout finality.",
    reward: "VP → VDX at claim finality",
    lock: "KYC-approved accounts: max 25 VDX per UTC day",
    risk: "Rewards vary with uptime and pool difficulty",
    cta: { href: "/mining", label: "Mining hub" },
    status: "Live",
  },
  {
    icon: Sprout,
    title: "Pool Incentives (Farms)",
    source: "VDX emission allocation",
    description: "Whitepaper v1.1 allocates 40% of supply to liquidity mining & farms. The final, capped emission schedule publishes before contracts deploy.",
    reward: "VDX emissions (schedule TBD by governance + auditors)",
    lock: "Per farm rules at launch",
    risk: "Emission rates decay over time",
    cta: { href: "/roadmap", label: "See roadmap" },
    status: "Planned",
  },
  {
    icon: Users,
    title: "Referral Rewards",
    source: "Invite miners & traders",
    description: "Share your referral link from the dashboard. You earn a bonus when referred accounts stay active.",
    reward: "VP bonuses per active referral",
    lock: "None",
    risk: "Depends on referral activity",
    cta: { href: "/dashboard", label: "Get your link" },
    status: "Live",
  },
];

export default function EarnPage() {
  return (
    <div className="container pb-24 pt-28 lg:pt-32">
      <SectionHeading
        align="left"
        tag="Earn"
        title={<>Real ways to earn, <span className="text-gradient">honestly explained.</span></>}
        description="Every earning method currently supported by Verdex — with the source of the reward, the lock terms, and the risks. Nothing here is a guaranteed return."
      />

      <RevealGroup className="mt-14 grid gap-5 md:grid-cols-2">
        {METHODS.map((m) => (
          <RevealItem key={m.title}>
            <Card glow className="edge-glow flex h-full flex-col gap-4 p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-emerald/25 bg-emerald/10 text-emerald-bright">
                  <m.icon className="h-5 w-5" />
                </span>
                <Badge variant={m.status === "Live" ? "default" : "neutral"}>{m.status}</Badge>
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold text-ink">{m.title}</h2>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-emerald-bright/80">{m.source}</p>
              </div>
              <p className="text-sm leading-relaxed text-muted">{m.description}</p>
              <dl className="space-y-2 rounded-xl border border-line bg-black/25 p-4 text-[13px]">
                <div className="flex justify-between gap-3"><dt className="text-muted">Reward</dt><dd className="text-right text-mist">{m.reward}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Lock</dt><dd className="text-right text-mist">{m.lock}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Risk</dt><dd className="text-right text-amber">{m.risk}</dd></div>
              </dl>
              <Link href={m.cta.href} className="group mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-bright">
                {m.cta.label}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Card>
          </RevealItem>
        ))}
      </RevealGroup>

      {/* top pools strip */}
      <Reveal className="mt-16">
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold text-ink">Current pool rates</h2>
            <DemoBadge label="Demo values" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {POOLS.map((p) => (
              <Link key={p.id} href={`/liquidity/add?pool=${p.id}`}>
                <div className="flex items-center justify-between rounded-xl border border-line bg-black/25 p-4 transition-all hover:border-emerald/40 hover:shadow-glow-sm">
                  <span className="flex items-center gap-3">
                    <TokenPairIcon a={p.tokenA} b={p.tokenB} size={30} />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{p.tokenA}/{p.tokenB}</span>
                      <span className="text-xs text-faint">TVL {fmtUSD(p.tvl)}</span>
                    </span>
                  </span>
                  <span className="mono text-sm font-bold text-emerald-bright">{fmtPct(p.apy)}</span>
                </div>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-xs text-faint">Rates float with volume, TVL and emissions. Estimates only — never a promise of return.</p>
        </Card>
      </Reveal>
    </div>
  );
}
