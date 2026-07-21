import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export const metadata = { title: "Liquidity Pools" };

export default function LiquidityPage() {
  return (
    <div className="min-h-screen py-24 px-4">
      <div className="max-w-xl mx-auto text-center space-y-6">
        <span className="section-tag">Liquidity</span>
        <h1 className="font-heading text-5xl font-800 tracking-tight mt-3">
          Liquidity <span className="gradient-text">Pools</span>
        </h1>
        <p className="text-vdx-muted">Provide liquidity and earn a share of swap fees.</p>
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[rgba(245,185,66,0.08)] border border-[rgba(245,185,66,0.2)] text-left">
          <AlertTriangle className="w-4 h-4 text-vdx-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm text-vdx-muted">
            Liquidity pool UI is coming with wallet-signed swap execution and audited contract deployment. AMM contracts and LP token mechanics are designed and pending audit.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Link href="/swap" className="btn-primary px-6 py-3">Try Swap</Link>
          <Link href="/roadmap" className="btn-outline px-6 py-3">View Roadmap</Link>
        </div>
      </div>
    </div>
  );
}
