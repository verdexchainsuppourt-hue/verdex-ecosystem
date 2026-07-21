import Link from "next/link";
import { VERDEX_CONSTANTS } from "@/lib/constants";
import { ExternalLink, Hash, Code2, MessageCircle, Video } from "lucide-react";

const FOOTER_LINKS = {
  Platform: [
    { label: "Swap", href: "/swap" },
    { label: "Liquidity", href: "/liquidity" },
    { label: "Earn", href: "/earn" },
    { label: "Mining", href: "/mining" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Explorer", href: "https://verdexswap.site/explorer", external: true },
  ],
  Resources: [
    { label: "VDX Token", href: "/vdx" },
    { label: "Whitepaper", href: "/whitepaper" },
    { label: "Documentation", href: "/docs" },
    { label: "Roadmap", href: "/roadmap" },
    { label: "FAQ", href: "/faq" },
    { label: "Security", href: "/security" },
  ],
  Ecosystem: [
    { label: "Ecosystem Overview", href: "/ecosystem" },
    { label: "Miner Downloads", href: "/dashboard/downloads" },
    { label: "P2P Marketplace", href: "/dashboard/p2p" },
    { label: "Referral Program", href: "/dashboard/referral" },
  ],
};

const SOCIAL_LINKS = [
  { label: "Twitter / X", href: VERDEX_CONSTANTS.social.twitter, Icon: Hash },
  { label: "GitHub", href: VERDEX_CONSTANTS.social.github, Icon: Code2 },
  { label: "Telegram", href: VERDEX_CONSTANTS.social.telegram, Icon: MessageCircle },
  { label: "TikTok", href: VERDEX_CONSTANTS.social.tiktok, Icon: Video },
];

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-[rgba(87,255,179,0.1)] bg-[#06100D]">
      {/* Top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-vdx-green/40 to-transparent" />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        {/* Main footer grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4 group">
              <svg viewBox="0 0 100 160" fill="none" className="w-7 h-7 drop-shadow-[0_0_10px_rgba(36,229,150,0.4)]">
                <path d="M50 0L95 80L50 55L5 80L50 0Z" fill="#57FFB3" />
                <path d="M50 0L95 80L50 55L50 0Z" fill="#24E596" />
                <path d="M50 105L95 80L50 160L5 80L50 105Z" fill="#57FFB3" />
                <path d="M50 105L95 80L50 160L50 105Z" fill="#24E596" />
              </svg>
              <span className="font-heading font-bold text-lg text-vdx-text">Verdex</span>
            </Link>
            <p className="text-vdx-muted text-sm leading-relaxed max-w-xs mb-6">
              A green EVM Layer-1 ecosystem with DePIN mining, AMM swap routing, and liquidity pools — all self-custodial.
            </p>
            {/* Social links */}
            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-9 h-9 rounded-lg glass flex items-center justify-center text-vdx-muted hover:text-vdx-green hover:border-[rgba(87,255,179,0.3)] transition-all duration-200"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-heading font-semibold text-xs text-vdx-green uppercase tracking-widest mb-4">
                {category}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-vdx-muted hover:text-vdx-text transition-colors duration-200"
                      >
                        {link.label}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-vdx-muted hover:text-vdx-text transition-colors duration-200"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-2 mb-8 px-4 py-3 rounded-xl bg-[rgba(36,229,150,0.05)] border border-[rgba(36,229,150,0.1)]">
          <span className="pulse-dot flex-shrink-0" />
          <span className="text-xs text-vdx-muted">
            <span className="text-vdx-green font-medium">Verdex Platform Online</span>
            {" · "}
            DePIN Miners Active · AMM Quotes Live · Chain ID 72010 (proposed, pending validator ceremony)
          </span>
        </div>

        {/* Bottom row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-8 border-t border-[rgba(87,255,179,0.08)]">
          <p className="text-xs text-vdx-muted">
            © 2026 Verdex. All rights reserved.{" "}
            <span className="text-[rgba(146,170,160,0.6)]">Developed by Suleman.</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {[
              { label: "Terms", href: "/terms" },
              { label: "Privacy", href: "/privacy" },
              { label: "Risk Disclosure", href: "/risk" },
              { label: "Security", href: "/security" },
            ].map((l) => (
              <Link key={l.label} href={l.href} className="text-xs text-vdx-muted hover:text-vdx-green transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="mt-6 text-[11px] text-[rgba(146,170,160,0.5)] leading-relaxed">
          This website is for informational purposes only and does not constitute financial, legal, or investment advice.
          Cryptocurrency involves substantial risk, including loss of capital. On-chain settlement requires verified RPC and deployed contracts.
          The VDX token, full mainnet, wallet-signed swaps, P2P market, bridge, and KYC intake are not yet fully live.
          All specifications remain subject to technical, security, and regulatory approvals.
        </p>
      </div>
    </footer>
  );
}
