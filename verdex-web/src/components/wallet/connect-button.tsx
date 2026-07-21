"use client";

import { useState } from "react";
import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWallet } from "./wallet-provider";
import { WalletModal } from "./wallet-modal";
import { shortAddr } from "@/lib/format";
import { CopyButton } from "@/components/shared/copy-button";

export function ConnectButton({ size = "md" }: { size?: "sm" | "md" }) {
  const { status, address, disconnect } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);

  if (status === "connected" && address) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="glass" size={size} aria-label="Wallet menu">
            <span className="h-2 w-2 rounded-full bg-emerald animate-pulse-dot" />
            <span className="mono">{shortAddr(address)}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Connected wallet</DropdownMenuLabel>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <code className="mono text-xs text-emerald-bright">{shortAddr(address, 6)}</code>
            <CopyButton value={address} label="Copy wallet address" className="h-7 w-7" />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={disconnect} className="text-danger focus:text-danger">
            <LogOut className="h-4 w-4" /> Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <Button size={size} onClick={() => setModalOpen(true)} aria-label="Connect wallet">
        <Wallet className="h-4 w-4" />
        {status === "connecting" ? "Connecting…" : "Connect Wallet"}
      </Button>
      <WalletModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
