import type { Metadata } from "next";
import Link from "next/link";
import { Flame, Landmark, Percent, Rocket, ShieldCheck, Vote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal, RevealGroup, RevealItem } from "@/components/shared/reveal";
import { DonutChart } from "@/components/charts/donut-chart";
import { VerdexMark } from "@/components/shared/logo";
import { TOKENOMICS, VESTING } from "@/lib/mock-data";
import { CHAIN } from "@/lib/constants";

export const metadata: Metadata = {
  title: "VDX Token",
  description: "VDX is the native asset of Verdex Mainnet — gas, liquidity pairs, governance, fee discounts and farm boosts. Supply and distribution from Whitepaper v1.1.",
};

const UTILITY = [
  { icon: Vote, title: "Governance", note: "Vote on fee tiers, farm allocations, chain deployments and treasury spending." },
  { icon: Percent, title: "Fee Discounts", note: "Staked VDX reduces swap fees proportionally to tier." },
  { icon: Rocket, title: "Farm Boosts", note: "Higher staking tiers multiply LP farming rewards." },
  { icon: Flame, title: "Buyback & Burn", note: "0.03% of every swap market-buys VDX and burns it." },
  { icon: Landmark, title: "Network Gas", note: "VDX pays transaction fees on Verdex Mainnet." },
  { icon: ShieldCheck, title: "Mining Payouts", note: "Verdex Points convert to VDX at claim finality." },
];

export default function VdxPage() {
  return (
    <div className="container pb-24 pt-28 lg:pt-32">
      {/* hero */}
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Badge className="mb-5">Native asset · {CHAIN.name}</Badge>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-ink sm:text-5xl lg:text-6xl text-balance">
            <span className="text-gradient">VDX</span> — the fuel of the Verdex ecosystem
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Gas, liquidity pairs, governance, fee discounts and mining payouts —
            one token connecting every Verdex product. Fixed supply, transparent distribution.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Fact k="Total supply" v="1B VDX" />
            <Fact k="Chain ID" v="72010" note="proposed" />
            <Fact k="Consensus" v="PoA QBFT" />
            <Fact k="Standard" v="Native / PRC20" />
          </div>
        </div>
        <Reveal className="relative mx-auto w-full max-w-sm">
          <Card glow className="edge-glow flex flex-col items-center gap-5 p-8 text-center">
            <VerdexMark className="h-24 w-16 animate-floaty drop-shadow-[0_0_36px_rgba(36,229,150,0.5)]" />
            <div>
              <p className="font-heading text-3xl font-extrabold text-gradient">$VDX</p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">Verdex Mainnet</p>
            </div>
            <p className="text-xs leading-relaxed text-faint">
              Token contracts deploy after validator ceremony, signed genesis and audits — see Roadmap.
            </p>
          </Card>
        </Reveal>
      </div>

      {/* utility */}
      <section className="mt-24" aria-label="VDX utility">
        <SectionHeading tag="Utility" title={<>Built into <span className="text-gradient">every layer.</span></>} />
        <RevealGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {UTILITY.map((u) => (
            <RevealItem key={u.title}>
              <Card glow className="flex h-full items-start gap-4 p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald/25 bg-emerald/10 text-emerald-bright">
                  <u.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-heading text-base font-bold text-ink">{u.title}</h3>
                  <p className="mt-1 text-sm text-muted">{u.note}</p>
                </div>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* distribution */}
      <section className="mt-24 grid items-start gap-8 lg:grid-cols-2" aria-label="Supply distribution">
        <Card className="p-6">
          <h2 className="font-heading text-lg font-bold text-ink">Supply distribution</h2>
          <p className="mt-1 text-xs text-faint">Whitepaper v1.1 · fixed supply 1,000,000,000 VDX</p>
          <DonutChart
            data={TOKENOMICS.map((t) => ({ name: t.label, value: t.pct, color: t.color }))}
            height={280}
            centerValue="1B"
            centerLabel="VDX"
          />
          <ul className="mt-2 space-y-2">
            {TOKENOMICS.map((t) => (
              <li key={t.label} className="flex items-center gap-2.5 text-sm">
                <span className="h-3 w-3 rounded-sm" style={{ background: t.color }} />
                <span className="flex-1 text-muted">{t.label}</span>
                <span className="mono font-semibold text-ink">{t.pct}%</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="font-heading text-lg font-bold text-ink">Emissions & vesting</h2>
          <p className="mt-1 text-xs text-faint">
            The final capped emission schedule is published by governance and auditors before contracts deploy.
          </p>
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Allocation</TableHead>
                <TableHead>Schedule</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {VESTING.map((v) => (
                <TableRow key={v.group}>
                  <TableCell className="font-medium text-ink">{v.group}</TableCell>
                  <TableCell className="mono whitespace-nowrap">{v.allocation}</TableCell>
                  <TableCell className="text-xs text-muted">{v.schedule}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-4 rounded-xl border border-line bg-black/25 p-3.5 text-xs leading-relaxed text-muted">
            No VDX is minted by consensus. The earlier illustrative 5M/week curve was superseded in
            Whitepaper v1.1 — a capped, time-indexed schedule will be published pre-deployment.
          </p>
        </Card>
      </section>

      {/* contract info */}
      <section className="mt-16" aria-label="Contract information">
        <Card className="edge-glow p-6 sm:p-8">
          <h2 className="font-heading text-lg font-bold text-ink">Contract information</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-black/25 p-4">
              <p className="text-xs uppercase tracking-wider text-faint">Network</p>
              <p className="mono mt-1.5 text-sm text-mist">{CHAIN.name}</p>
            </div>
            <div className="rounded-xl border border-line bg-black/25 p-4">
              <p className="text-xs uppercase tracking-wider text-faint">Chain ID</p>
              <p className="mono mt-1.5 text-sm text-mist">{CHAIN.proposedChainId} (proposed)</p>
            </div>
            <div className="rounded-xl border border-line bg-black/25 p-4">
              <p className="text-xs uppercase tracking-wider text-faint">Token contract</p>
              <p className="mt-1.5 text-sm text-amber">Publishes after verification</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-faint">
            Token information will be published here after official confirmation. Never trust a VDX contract
            address from unofficial sources.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/whitepaper"><Button variant="outline">Read Whitepaper</Button></Link>
            <Link href="/roadmap"><Button variant="ghost">View Roadmap</Button></Link>
          </div>
        </Card>
      </section>
    </div>
  );
}

function Fact({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4 backdrop-blur-xl">
      <p className="text-[11px] uppercase tracking-wider text-faint">{k}</p>
      <p className="mono mt-1 text-lg font-bold text-ink">{v}</p>
      {note && <p className="text-[10px] text-faint">{note}</p>}
    </div>
  );
}
