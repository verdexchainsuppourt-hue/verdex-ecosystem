import Link from "next/link";
import { Zap, Droplets, Pickaxe, Coins, Globe, Link2, ArrowRight } from "lucide-react";

export const metadata = { title: "Ecosystem" };

const PRODUCTS = [
  { icon: Zap, title: "Verdex Swap", desc: "AMM-powered token exchange with intelligent multi-hop routing and 0.25% fee.", href: "/swap", status: "Quotes Live" },
  { icon: Droplets, title: "Verdex Pool", desc: "Add or remove liquidity to token pair pools. LP providers earn 0.17% of every swap.", href: "/liquidity", status: "Coming Soon" },
  { icon: Pickaxe, title: "VDX Mining", desc: "DePIN mining system. Contribute compute, earn Verdex Points redeemable for VDX.", href: "/mining", status: "Live" },
  { icon: Coins, title: "VDX Staking", desc: "Stake VDX for governance power, fee discounts (10–75%), and farm yield boosts.", href: "/vdx", status: "At TGE" },
  { icon: Globe, title: "Verdex Explorer", desc: "On-chain block explorer for the Verdex L1 network — search transactions, addresses, blocks.", href: "https://verdexswap.site/explorer", status: "Live" },
  { icon: Link2, title: "Verdex L1", desc: "Custom Hyperledger Besu QBFT chain. Proposed Chain ID 72010. PoA with zero-inflation VDX.", href: "/whitepaper", status: "Pending Ceremony" },
];

export default function EcosystemPage() {
  return (
    <div className="py-20">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="text-center">
          <span className="section-tag mb-3 block">Ecosystem</span>
          <h1 className="font-heading text-5xl font-800 tracking-tight mb-4">
            The Verdex <span className="gradient-text">Ecosystem</span>
          </h1>
          <p className="text-vdx-muted text-lg max-w-2xl mx-auto">
            Every component of Verdex is designed to work together — from swap routing to mining rewards to governance — creating a unified, self-custodial Web3 platform.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PRODUCTS.map((p) => (
            <Link key={p.title} href={p.href} className="vdx-card p-7 group">
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-vdx-green/10 border border-vdx-green/20 flex items-center justify-center">
                  <p.icon className="w-5 h-5 text-vdx-green" />
                </div>
                <span className="text-[10px] font-semibold text-vdx-muted bg-[rgba(87,255,179,0.06)] border border-[rgba(87,255,179,0.12)] px-2.5 py-1 rounded-full">
                  {p.status}
                </span>
              </div>
              <h3 className="font-heading font-bold text-lg mb-2">{p.title}</h3>
              <p className="text-vdx-muted text-sm leading-relaxed mb-4">{p.desc}</p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-vdx-green group-hover:gap-2.5 transition-all">
                Learn more <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          ))}
        </div>

        {/* Architecture diagram placeholder */}
        <div className="vdx-card p-8 text-center">
          <h2 className="font-heading font-bold text-xl mb-3">Unified Architecture</h2>
          <p className="text-vdx-muted text-sm max-w-xl mx-auto mb-6">
            Verdex's green L1 blockchain connects every product layer. Smart contracts power the AMM, farms, and governance. The DePIN mining network secures compute distribution. Every layer is self-custodial.
          </p>
          <Link href="/whitepaper#architecture" className="btn-outline text-sm px-6 py-3">
            Read Technical Architecture
          </Link>
        </div>
      </div>
    </div>
  );
}
