"use client";

import { Chrome } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SecurityWarning } from "@/components/shared/security-warning";
import { useWallet } from "./wallet-provider";
import { cn } from "@/lib/utils";

const WALLET_OPTIONS = [
  { id: "metamask", name: "MetaMask", note: "Browser extension & mobile", icon: "🦊" },
  { id: "eip1193", name: "Any EIP-1193 Wallet", note: "Uses the injected provider", icon: "🛡️" },
];

export function WalletModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { connect, hasProvider } = useWallet();

  async function choose() {
    await connect();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Connect a self-custodial wallet to trade on Verdex Mainnet. Your keys never leave your wallet.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2.5">
          {WALLET_OPTIONS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={choose}
              disabled={!hasProvider}
              className={cn(
                "flex items-center gap-3.5 rounded-xl border border-line bg-white/[0.02] px-4 py-3.5 text-left transition-all",
                hasProvider ? "hover:border-emerald/40 hover:bg-emerald/[0.06] hover:shadow-glow-sm" : "opacity-50 cursor-not-allowed"
              )}
            >
              <span className="text-2xl" aria-hidden="true">{w.icon}</span>
              <span>
                <span className="block text-sm font-semibold text-ink">{w.name}</span>
                <span className="block text-xs text-muted">{w.note}</span>
              </span>
            </button>
          ))}
        </div>

        {!hasProvider && (
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-cyan/30 bg-cyan/10 px-4 py-3 text-sm font-semibold text-cyan transition-colors hover:bg-cyan/20"
          >
            <Chrome className="h-4 w-4" /> Install MetaMask
          </a>
        )}

        <SecurityWarning compact />
      </DialogContent>
    </Dialog>
  );
}
