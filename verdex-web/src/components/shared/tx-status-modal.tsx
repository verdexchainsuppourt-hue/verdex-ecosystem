"use client";

import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";
import { shortHash } from "@/lib/format";
import { LINKS } from "@/lib/constants";

export type TxPhase = "confirm" | "pending" | "success" | "failed";

export interface TxModalState {
  open: boolean;
  phase: TxPhase;
  title: string;
  description?: string;
  hash?: string;
  error?: string;
}

export const idleTx: TxModalState = { open: false, phase: "confirm", title: "" };

export function TxStatusModal({ state, onClose }: { state: TxModalState; onClose: () => void }) {
  return (
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-live="polite">
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          {state.description && <DialogDescription>{state.description}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {state.phase === "confirm" && (
            <span className="grid h-16 w-16 place-items-center rounded-full border border-emerald/30 bg-emerald/10">
              <span className="h-3 w-3 rounded-full bg-emerald animate-pulse-dot" />
            </span>
          )}
          {state.phase === "pending" && (
            <span className="grid h-16 w-16 place-items-center rounded-full border border-cyan/30 bg-cyan/10">
              <Loader2 className="h-7 w-7 animate-spin text-cyan" />
            </span>
          )}
          {state.phase === "success" && (
            <span className="grid h-16 w-16 place-items-center rounded-full border border-emerald/40 bg-emerald/10 animate-block-pop">
              <CheckCircle2 className="h-8 w-8 text-emerald-bright" />
            </span>
          )}
          {state.phase === "failed" && (
            <span className="grid h-16 w-16 place-items-center rounded-full border border-danger/40 bg-danger/10 animate-block-pop">
              <XCircle className="h-8 w-8 text-danger" />
            </span>
          )}

          <p className="text-sm text-muted text-center">
            {state.phase === "confirm" && "Review and confirm this transaction in your wallet."}
            {state.phase === "pending" && "Transaction submitted. Waiting for on-chain confirmation…"}
            {state.phase === "success" && "Transaction confirmed on Verdex Mainnet."}
            {state.phase === "failed" && (state.error ?? "The transaction failed or was rejected.")}
          </p>

          {state.hash && (
            <div className="flex items-center gap-2 rounded-xl border border-line bg-black/30 px-3.5 py-2">
              <code className="mono text-xs text-emerald-bright">{shortHash(state.hash)}</code>
              <CopyButton value={state.hash} label="Copy transaction hash" className="h-7 w-7" />
              <a
                href={`${LINKS.explorer}/tx/${state.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View transaction in explorer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-white/[0.03] text-muted transition-colors hover:border-emerald/40 hover:text-emerald-bright"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>

        {(state.phase === "success" || state.phase === "failed") && (
          <Button variant="outline" onClick={onClose} className="w-full">Close</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
