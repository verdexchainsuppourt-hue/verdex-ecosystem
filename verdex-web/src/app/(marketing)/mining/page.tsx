import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BookOpen, CheckCircle2, Cpu, Download, Gauge,
  HardDrive, LayoutDashboard, MonitorSmartphone, Pickaxe, ShieldCheck, Smartphone, Terminal, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal, RevealGroup, RevealItem } from "@/components/shared/reveal";
import { SecurityWarning } from "@/components/shared/security-warning";
import { DOWNLOADS, LINKS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "VDX Mining",
  description: "What VDX mining is, how the Verdex miner works on Windows, Android and Linux, and how rewards are credited.",
};

const PROCESS = [
  { icon: UserPlus, title: "Create Account", note: "Email or Google — 1 minute" },
  { icon: Download, title: "Download Miner", note: "Windows · Android · Linux" },
  { icon: ShieldCheck, title: "Authenticate", note: "API token from dashboard" },
  { icon: Pickaxe, title: "Start Mining", note: "Valid heartbeats earn VP" },
  { icon: Gauge, title: "Track Rewards", note: "VP → VDX at payout finality" },
];

const REQUIREMENTS = [
  { icon: MonitorSmartphone, k: "Platforms", v: "Windows 10/11 · Android APK · Linux CLI · browser" },
  { icon: Cpu, k: "Hardware", v: "Any modern CPU; GPU improves valid-share rate" },
  { icon: HardDrive, k: "Footprint", v: "Lightweight — miner auto-updates on launch" },
  { icon: Terminal, k: "Auth", v: "Per-device API tokens, revocable anytime" },
];

const OS_ICONS = { Windows: MonitorSmartphone, Android: Smartphone, "Linux CLI": Terminal } as const;

export default function MiningPage() {
  return (
    <div className="container pb-24 pt-28 lg:pt-32">
      {/* hero */}
      <div className="mx-auto max-w-3xl text-center">
        <Badge className="mb-5">DePIN · Windows v4.0.2 · Android v1.9.5</Badge>
        <h1 className="font-heading text-4xl font-bold tracking-tight text-ink sm:text-5xl lg:text-6xl text-balance">
          Mine <span className="text-gradient">VDX</span> with the hardware you already own
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          The Verdex DePIN pool credits valid miner heartbeats as Verdex Points (VP).
          VP converts to VDX at payout finality. Simple to start, transparent to track.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
          <Link href="/dashboard/downloads">
            <Button size="lg"><Download className="h-[18px] w-[18px]" /> Download Miner</Button>
          </Link>
          <Link href="/dashboard/mining">
            <Button size="lg" variant="outline"><LayoutDashboard className="h-[18px] w-[18px]" /> Open Mining Dashboard</Button>
          </Link>
          <Link href="/docs" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-emerald-bright">
            <BookOpen className="h-4 w-4" /> Read Mining Guide
          </Link>
        </div>
      </div>

      {/* process */}
      <section className="mt-24" aria-label="Mining process">
        <SectionHeading tag="Process" title={<>From zero to mining in <span className="text-gradient">five steps.</span></>} />
        <RevealGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PROCESS.map((s, i) => (
            <RevealItem key={s.title}>
              <Card className="relative h-full p-5 text-center" glow>
                <span className="absolute right-4 top-3 font-heading text-3xl font-extrabold text-emerald/10">{i + 1}</span>
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-emerald/25 bg-emerald/10 text-emerald-bright">
                  <s.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3.5 font-heading text-[15px] font-bold text-ink">{s.title}</h3>
                <p className="mt-1 text-xs text-muted">{s.note}</p>
                {i < PROCESS.length - 1 && (
                  <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-emerald/50 lg:block" aria-hidden="true" />
                )}
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* requirements */}
      <section className="mt-20" aria-label="Requirements">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REQUIREMENTS.map((r) => (
            <Card key={r.k} className="flex items-start gap-3.5 p-5">
              <r.icon className="h-5 w-5 shrink-0 text-emerald-bright" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">{r.k}</p>
                <p className="mt-1 text-sm text-mist">{r.v}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* downloads */}
      <section className="mt-20" aria-label="Miner downloads">
        <SectionHeading tag="Downloads" title={<>Official miner <span className="text-gradient">releases.</span></>} description="Only download the Verdex miner from verdexswap.site. Verify the checksum before running any CLI software." />
        <RevealGroup className="mt-12 grid gap-5 md:grid-cols-3">
          {DOWNLOADS.map((d) => {
            const Icon = OS_ICONS[d.os as keyof typeof OS_ICONS] ?? Download;
            const external = d.file.startsWith("http");
            return (
              <RevealItem key={d.os}>
                <Card glow className="edge-glow flex h-full flex-col p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl border border-emerald/25 bg-emerald/10 text-emerald-bright">
                      <Icon className="h-5 w-5" />
                    </span>
                    <Badge>{d.version}</Badge>
                  </div>
                  <h3 className="mt-4 font-heading text-lg font-bold text-ink">{d.os}</h3>
                  <dl className="mt-3 space-y-1.5 text-xs text-muted">
                    <div className="flex justify-between"><dt>Released</dt><dd className="mono text-mist">{d.date}</dd></div>
                    <div className="flex justify-between"><dt>Size</dt><dd className="mono text-mist">{d.size}</dd></div>
                    <div className="flex justify-between gap-2"><dt>SHA-256</dt><dd className="mono text-right text-faint">{d.sha256}</dd></div>
                  </dl>
                  <ul className="mt-4 space-y-1.5">
                    {d.notes.map((n) => (
                      <li key={n} className="flex items-start gap-2 text-xs text-muted">
                        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald" /> {n}
                      </li>
                    ))}
                  </ul>
                  <a href={d.file} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="mt-5 block">
                    <Button className="w-full" variant={external ? "primary" : "outline"}>
                      <Download className="h-4 w-4" /> {external ? "Download" : "Get from dashboard"}
                    </Button>
                  </a>
                </Card>
              </RevealItem>
            );
          })}
        </RevealGroup>
        <Reveal className="mt-8">
          <SecurityWarning />
        </Reveal>
      </section>

      {/* how rewards work */}
      <section className="mt-20" aria-label="How rewards work">
        <Card className="edge-glow grid gap-8 p-8 lg:grid-cols-2 lg:p-10">
          <div>
            <h2 className="font-heading text-2xl font-bold text-ink">How rewards are calculated</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Your miner authenticates with an API token and submits heartbeats while online.
              Valid heartbeats accrue Verdex Points (VP) based on uptime and valid work.
              When you request payout, eligible VP converts to VDX at claim finality.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-muted">
              {[
                "Rewards scale with uptime and valid shares — they are variable, never fixed.",
                "KYC-approved Android accounts are capped at 25 VDX per UTC day.",
                "API tokens are per-device and revocable from your dashboard at any time.",
                "Miner apps auto-update on launch, so you always run the latest build.",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-black/30 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-faint">Example session</p>
            <div className="mono mt-4 space-y-3 text-[13px]">
              <div className="flex justify-between"><span className="text-muted">$ verdex-miner auth --token</span><span className="text-emerald-bright">vdx_live_••••</span></div>
              <div className="flex justify-between"><span className="text-muted">$ verdex-miner start</span><span className="text-cyan">--worker rig-01</span></div>
              <div className="border-t border-line pt-3 text-muted">→ heartbeat ok · +0.42 VP</div>
              <div className="text-muted">→ heartbeat ok · +0.42 VP</div>
              <div className="text-emerald-bright">→ session summary · 6h 42m · +412.6 VP</div>
              <div className="border-t border-line pt-3 text-faint">VP converts to VDX at payout finality</div>
            </div>
          </div>
        </Card>
      </section>

      {/* explorer link */}
      <p className="mt-12 text-center text-sm text-muted">
        Want on-chain proof? Watch miner payouts land on the{" "}
        <a href={LINKS.explorer} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-bright hover:underline">
          Verdex Explorer
        </a>.
      </p>
    </div>
  );
}
