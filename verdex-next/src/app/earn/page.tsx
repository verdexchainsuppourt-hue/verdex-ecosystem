import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export const metadata = { title: "Earn" };

export default function EarnPage() {
  return (
    <div className="min-h-screen py-24 px-4">
      <div className="max-w-xl mx-auto text-center space-y-6">
        <span className="section-tag">Earn</span>
        <h1 className="font-heading text-5xl font-800 tracking-tight mt-3">
          Earn with <span className="gradient-text">Verdex</span>
        </h1>
        <p className="text-vdx-muted">LP fees, yield farms, staking rewards, and mining VP.</p>
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[rgba(245,185,66,0.08)] border border-[rgba(245,185,66,0.2)] text-left">
          <AlertTriangle className="w-4 h-4 text-vdx-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm text-vdx-muted">
            LP farming, yield vaults and staking require deployed VDX contracts and mainnet launch. Mining VP is live and available now.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/mining" className="btn-primary px-6 py-3">Mine VDX Now</Link>
          <Link href="/vdx" className="btn-outline px-6 py-3">VDX Tokenomics</Link>
          <Link href="/roadmap" className="btn-outline px-6 py-3">Roadmap</Link>
        </div>
      </div>
    </div>
  );
}
