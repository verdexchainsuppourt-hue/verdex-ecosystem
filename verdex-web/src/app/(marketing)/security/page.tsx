import type { Metadata } from "next";
import {
  DownloadCloud, FileCheck2, KeyRound, Lock, MailWarning, MonitorCheck,
  ShieldAlert, ShieldCheck, Timer, UserCheck, Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/shared/section-heading";
import { RevealGroup, RevealItem } from "@/components/shared/reveal";
import { SecurityWarning } from "@/components/shared/security-warning";

export const metadata: Metadata = {
  title: "Security",
  description: "Verdex security model — self-custody, account protection, miner download verification, and responsible disclosure.",
};

const AREAS = [
  {
    icon: Wallet,
    title: "Self-Custody",
    status: "By design",
    body: "Swaps and liquidity are non-custodial smart-contract interactions. Verdex never holds user funds, and account sign-in never touches your wallet keys.",
  },
  {
    icon: KeyRound,
    title: "Wallet Security",
    status: "By design",
    body: "The dashboard wallet generates mnemonics locally in your browser. Secrets are never transmitted. We will never ask you to type a seed phrase anywhere.",
  },
  {
    icon: FileCheck2,
    title: "Smart-Contract Security",
    status: "Pre-launch",
    body: "Per Whitepaper v1.1: independent audits by at least two firms, formal verification of AMM invariants, timelocked admin actions, and a multisig treasury — all required before mainnet launch. No audit is claimed complete yet.",
  },
  {
    icon: UserCheck,
    title: "Account Security",
    status: "Live",
    body: "Email verification codes on registration, Google OAuth support, per-device API tokens for miners, and session management from your dashboard.",
  },
  {
    icon: DownloadCloud,
    title: "Miner Download Verification",
    status: "Live",
    body: "Download the miner only from verdexswap.site. Compare the published SHA-256 checksum before running CLI software. Miner apps auto-update on launch.",
  },
  {
    icon: Timer,
    title: "Session Management",
    status: "Live",
    body: "Sessions use secure token refresh. Sign out remotely from the dashboard, and revoke any device token instantly.",
  },
  {
    icon: MonitorCheck,
    title: "Official-Link Verification",
    status: "Always",
    body: "The only official domain is verdexswap.site. Bookmark it. Beware lookalike domains, fake airdrops, and impersonator accounts.",
  },
  {
    icon: MailWarning,
    title: "Phishing Protection",
    status: "Always",
    body: "Verdex staff never DM first, never ask for codes, passwords, seed phrases, or private keys. When in doubt, ask in the official Discord or Telegram.",
  },
  {
    icon: Lock,
    title: "Responsible Disclosure",
    status: "Planned",
    body: "A public bug-bounty program is planned per the whitepaper. Until then, report vulnerabilities privately via the contact email in the footer.",
  },
];

const RULES = [
  "Verdex never asks for seed phrases",
  "Never share private keys with anyone",
  "Verify the official website before downloading software",
  "Check file hashes before running CLI software",
  "Confirm wallet transaction details before signing",
];

export default function SecurityPage() {
  return (
    <div className="container pb-24 pt-28 lg:pt-32">
      <SectionHeading
        align="left"
        tag="Security"
        title={<>Security is a <span className="text-gradient">product feature.</span></>}
        description="The verified security model of Verdex — what protects you by design, what is still pre-launch, and the rules that keep you safe."
      />

      <RevealGroup className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {AREAS.map((a) => (
          <RevealItem key={a.title}>
            <Card glow className="flex h-full flex-col gap-3 p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-emerald/25 bg-emerald/10 text-emerald-bright">
                  <a.icon className="h-5 w-5" />
                </span>
                <Badge variant={a.status === "Live" || a.status === "By design" || a.status === "Always" ? "default" : "amber"}>
                  {a.status}
                </Badge>
              </div>
              <h2 className="font-heading text-lg font-bold text-ink">{a.title}</h2>
              <p className="text-sm leading-relaxed text-muted">{a.body}</p>
            </Card>
          </RevealItem>
        ))}
      </RevealGroup>

      {/* permanent rules */}
      <section id="risk" className="mt-16 scroll-mt-24">
        <Card className="border-amber/25 bg-amber/[0.04] p-8">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-amber" />
            <h2 className="font-heading text-xl font-bold text-ink">Permanent safety rules</h2>
          </div>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {RULES.map((r) => (
              <li key={r} className="flex items-start gap-2.5 rounded-xl border border-amber/20 bg-black/25 p-4 text-sm text-mist">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber" /> {r}
              </li>
            ))}
          </ul>
          <SecurityWarning className="mt-6" />
        </Card>
      </section>
    </div>
  );
}
