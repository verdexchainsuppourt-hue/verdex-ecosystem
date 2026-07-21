import Link from "next/link";
import { Github, Send, Twitter, MessageCircle, Music2 } from "lucide-react";
import { VerdexLogo, VerdexMark } from "@/components/shared/logo";
import { LINKS } from "@/lib/constants";

const COLUMNS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/swap", label: "Swap" },
      { href: "/liquidity", label: "Liquidity" },
      { href: "/earn", label: "Earn" },
      { href: "/mining", label: "Mining" },
      { href: "/vdx", label: "VDX Token" },
    ],
  },
  {
    title: "Platform",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dashboard/wallet", label: "Wallet" },
      { href: "/dashboard/mining", label: "Mining Dashboard" },
      { href: "/dashboard/downloads", label: "Miner Downloads" },
      { href: "/register", label: "Create Account" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/whitepaper", label: "Whitepaper" },
      { href: "/docs", label: "Documentation" },
      { href: "/security", label: "Security" },
      { href: "/roadmap", label: "Roadmap" },
      { href: LINKS.explorer, label: "Block Explorer", external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/security#risk", label: "Risk Disclosure" },
      { href: "/security", label: "Security Practices" },
      { href: "/docs", label: "Terms of Use" },
      { href: "/docs", label: "Privacy" },
    ],
  },
];

const SOCIALS = [
  { href: LINKS.github, label: "GitHub", icon: Github },
  { href: LINKS.x, label: "X (Twitter)", icon: Twitter },
  { href: LINKS.discord, label: "Discord", icon: MessageCircle },
  { href: LINKS.telegram, label: "Telegram", icon: Send },
  { href: LINKS.tiktok, label: "TikTok", icon: Music2 },
];

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-line bg-surface/60">
      {/* ambient glow + grid */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-48 w-[70%] -translate-x-1/2 rounded-full bg-emerald/[0.07] blur-[80px]" />
        <div className="grid-bg absolute inset-0 opacity-40" />
      </div>

      <div className="container relative">
        <div className="grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <VerdexLogo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              One self-custodial ecosystem for decentralized swaps, liquidity, and VDX mining.
              Swap Smart. Grow Green.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted transition-all hover:border-emerald/40 hover:text-emerald-bright hover:shadow-glow-sm"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-black/30 px-3.5 py-1.5 text-xs text-muted">
              <span className="h-2 w-2 rounded-full bg-emerald animate-pulse-dot" />
              Verdex Platform Online
              <span className="text-faint">· visual indicator</span>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wider text-ink">{col.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {"external" in l && l.external ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm text-muted transition-colors hover:text-emerald-bright">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-sm text-muted transition-colors hover:text-emerald-bright">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-line/60 py-6 sm:flex-row">
          <p className="flex items-center gap-2 text-xs text-faint">
            <VerdexMark className="h-4 w-2.5" />
            © 2026 Verdex. All rights reserved.
          </p>
          <p className="max-w-xl text-center text-[11px] leading-relaxed text-faint sm:text-right">
            Verdex is pre-mainnet-launch software. Nothing here is financial advice.
            Crypto assets involve risk — yields and mining rewards are variable and never guaranteed.
          </p>
        </div>
      </div>
    </footer>
  );
}
