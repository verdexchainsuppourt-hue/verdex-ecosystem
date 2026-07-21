"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TokenIcon } from "@/components/shared/token-icon";
import { QrCode } from "@/components/shared/qr-code";
import { CopyButton } from "@/components/shared/copy-button";
import { DemoBadge } from "@/components/shared/demo-badge";
import { SecurityWarning } from "@/components/shared/security-warning";
import { EmptyState } from "@/components/shared/states";
import { CHAIN, LINKS, TOKENS } from "@/lib/constants";
import { DEMO_SNAPSHOT } from "@/lib/mock-data";
import { fmtToken, shortAddr } from "@/lib/format";

const DEMO_ADDRESS = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
const BALANCES = [
  { symbol: "VDX", amount: DEMO_SNAPSHOT.vdxBalance, note: "Native · Verdex Mainnet" },
  { symbol: "WVDX", amount: 32.5, note: "Wrapped VDX" },
  { symbol: "USDT", amount: 412.0, note: "PRC20" },
  { symbol: "ALP", amount: 8.4, note: "PRC20" },
];

export default function WalletPage() {
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendAsset, setSendAsset] = useState("VDX");
  const [sending, setSending] = useState(false);
  const addressValid = /^0x[a-fA-F0-9]{40}$/.test(sendTo);
  const balance = BALANCES.find((b) => b.symbol === sendAsset)?.amount ?? 0;
  const amount = parseFloat(sendAmount) || 0;

  async function send() {
    if (!addressValid || amount <= 0 || amount > balance) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 1400));
    setSending(false);
    toast.success("Transaction submitted (simulated)", {
      description: "Production sends sign inside your wallet provider — secrets never touch this app.",
    });
    setSendTo("");
    setSendAmount("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">Wallet</h1>
          <p className="mt-1 text-sm text-muted">Self-custodial balances on {CHAIN.name}.</p>
        </div>
        <DemoBadge label="Demo balances" />
      </div>

      {/* address card */}
      <Card className="edge-glow flex flex-col items-center gap-5 p-6 sm:flex-row sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">Your deposit address</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="mono truncate text-sm text-emerald-bright sm:text-base">{DEMO_ADDRESS}</code>
            <CopyButton value={DEMO_ADDRESS} label="Copy deposit address" />
            <a
              href={`${LINKS.explorer}/address/${DEMO_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View address in explorer"
              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-emerald/40 hover:text-emerald-bright"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="mt-2 text-xs text-faint">Network: {CHAIN.name} · Chain ID {CHAIN.proposedChainId} (proposed)</p>
        </div>
        <div className="rounded-2xl border border-line bg-black/30 p-3">
          <QrCode value={DEMO_ADDRESS} size={128} />
        </div>
      </Card>

      {/* balances */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BALANCES.map((b) => (
          <Card key={b.symbol} glow className="flex items-center gap-3.5 p-4">
            <TokenIcon symbol={b.symbol} size={40} />
            <div className="min-w-0">
              <p className="mono truncate text-lg font-bold text-ink">{fmtToken(b.amount)}</p>
              <p className="truncate text-xs text-muted">{TOKENS[b.symbol]?.name} · {b.note}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* send / receive */}
      <Tabs defaultValue="send">
        <TabsList>
          <TabsTrigger value="send"><ArrowUpRight className="h-4 w-4" /> Send</TabsTrigger>
          <TabsTrigger value="receive"><ArrowDownLeft className="h-4 w-4" /> Receive</TabsTrigger>
        </TabsList>

        <TabsContent value="send">
          <Card className="max-w-xl p-6">
            <h2 className="font-heading text-lg font-bold text-ink">Send tokens</h2>
            <p className="mt-1 text-xs text-faint">Signing happens in your wallet provider. This preview never handles keys.</p>
            <div className="mt-5 space-y-4">
              <div>
                <Label className="mb-1.5 block">Asset</Label>
                <div className="flex flex-wrap gap-2">
                  {BALANCES.map((b) => (
                    <button
                      key={b.symbol}
                      onClick={() => setSendAsset(b.symbol)}
                      aria-pressed={sendAsset === b.symbol}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${sendAsset === b.symbol ? "border-emerald/50 bg-emerald/15 text-emerald-bright" : "border-line text-muted hover:text-ink"}`}
                    >
                      <TokenIcon symbol={b.symbol} size={16} /> {b.symbol}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="send-to" className="mb-1.5 block">Recipient address</Label>
                <Input
                  id="send-to"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder="0x…"
                  className="mono"
                  aria-invalid={sendTo.length > 0 && !addressValid}
                />
                {sendTo.length > 0 && !addressValid && <p className="mt-1.5 text-xs text-danger">Enter a valid EVM address (0x + 40 hex characters).</p>}
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label htmlFor="send-amount">Amount</Label>
                  <button onClick={() => setSendAmount(String(balance))} className="text-xs font-semibold text-emerald-bright hover:underline">
                    MAX {fmtToken(balance)}
                  </button>
                </div>
                <Input
                  id="send-amount"
                  value={sendAmount}
                  onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setSendAmount(e.target.value)}
                  placeholder="0.0"
                  inputMode="decimal"
                />
                {amount > balance && <p className="mt-1.5 text-xs text-danger">Insufficient {sendAsset} balance.</p>}
              </div>
              <Button className="w-full" size="lg" disabled={!addressValid || amount <= 0 || amount > balance || sending} onClick={send}>
                <Send className="h-4 w-4" /> {sending ? "Submitting…" : `Send ${sendAsset}`}
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="receive">
          <Card className="flex max-w-xl flex-col items-center gap-5 p-8 text-center">
            <h2 className="font-heading text-lg font-bold text-ink">Receive tokens</h2>
            <div className="rounded-2xl border border-line bg-black/30 p-4">
              <QrCode value={DEMO_ADDRESS} size={180} />
            </div>
            <div className="flex items-center gap-2">
              <code className="mono text-sm text-emerald-bright">{shortAddr(DEMO_ADDRESS, 8)}</code>
              <CopyButton value={DEMO_ADDRESS} label="Copy deposit address" />
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-muted">
              Send only {CHAIN.name} assets to this address. Tokens on other networks may be unrecoverable.
            </p>
          </Card>
        </TabsContent>
      </Tabs>

      {/* history placeholder */}
      <Card className="p-6">
        <h2 className="mb-4 font-heading text-lg font-bold text-ink">Wallet history</h2>
        <EmptyState
          title="No on-chain history yet"
          description="Incoming and outgoing transactions will appear here once the explorer indexer is connected to this view."
        />
      </Card>

      <SecurityWarning compact />
    </div>
  );
}
