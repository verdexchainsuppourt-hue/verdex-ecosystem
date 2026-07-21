"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Info, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TokenSelector } from "./token-selector";
import { RouteVisual } from "./route-visual";
import { NetworkSelector } from "@/components/wallet/network-selector";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatusModal, idleTx, type TxModalState } from "@/components/shared/tx-status-modal";
import { InfoTip } from "@/components/ui/tooltip";
import { FEES, TOKENS } from "@/lib/constants";
import { fmtToken } from "@/lib/format";
import { cn } from "@/lib/utils";

/* Demo balances so the UI is fully explorable without funds. Clearly not real funds. */
const DEMO_BALANCES: Record<string, number> = { VDX: 1240.5, WVDX: 860.25, USDT: 5320.0, ALP: 148.6, USDC: 2100.0 };

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; amountOut: number; path: string[]; source: "on-chain" | "estimate" }
  | { status: "error"; message: string };

function mockQuote(amountIn: number, tokenIn: string, tokenOut: string) {
  const a = TOKENS[tokenIn];
  const b = TOKENS[tokenOut];
  if (!a || !b) return 0;
  const usdIn = amountIn * a.price;
  const out = (usdIn / b.price) * (1 - FEES.totalPct / 100);
  return out;
}

function priceImpact(amountIn: number, tokenIn: string) {
  const usd = amountIn * (TOKENS[tokenIn]?.price ?? 1);
  return Math.min(12, usd / 25000); // demo curve
}

export function SwapCard() {
  const wallet = useWallet();
  const [network, setNetwork] = useState("verdex");
  const [tokenIn, setTokenIn] = useState("WVDX");
  const [tokenOut, setTokenOut] = useState("USDT");
  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState(0.5);
  const [customSlippage, setCustomSlippage] = useState("");
  const [deadline, setDeadline] = useState(20);
  const [showSettings, setShowSettings] = useState(false);
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [tx, setTx] = useState<TxModalState>(idleTx);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connected = wallet.status === "connected";
  const wrongNetwork = connected && network === "verdex" && wallet.chainId !== null && !wallet.isVerdexNetwork;
  const amount = parseFloat(amountIn) || 0;
  const balanceIn = DEMO_BALANCES[tokenIn] ?? 0;
  const insufficient = connected && amount > balanceIn;
  const needsApproval = connected && tokenIn !== "WVDX" && !approved[tokenIn] && amount > 0;

  /* ---------- quote (debounced; mirrors production estimate flow) ---------- */
  const fetchQuote = useCallback(() => {
    if (amount <= 0 || tokenIn === tokenOut) {
      setQuote({ status: "idle" });
      return;
    }
    setQuote({ status: "loading" });
    // Simulate the router round-trip; production calls findBestRoute via /api/rpc.
    const timer = setTimeout(() => {
      const out = mockQuote(amount, tokenIn, tokenOut);
      if (!out || !isFinite(out)) {
        setQuote({ status: "error", message: "No route available for this pair." });
        return;
      }
      const direct = Math.random() > 0.35;
      const path = direct ? [tokenIn, tokenOut] : [tokenIn, "WVDX", tokenOut];
      setQuote({ status: "ready", amountOut: out, path, source: "estimate" });
    }, 450);
    return () => clearTimeout(timer);
  }, [amount, tokenIn, tokenOut]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchQuote, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchQuote]);

  const amountOut = quote.status === "ready" ? quote.amountOut : 0;
  const impact = amount > 0 ? priceImpact(amount, tokenIn) : 0;
  const minReceived = amountOut * (1 - slippage / 100);
  const lpFee = amount * (FEES.totalPct / 100);
  const rate = amount > 0 && amountOut > 0 ? amountOut / amount : 0;

  function flip() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("");
    setQuote({ status: "idle" });
  }

  function setMax() {
    setAmountIn(String(balanceIn));
  }

  function fakeHash() {
    return "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  }

  async function runTx(kind: "approve" | "swap") {
    const title = kind === "approve" ? `Approve ${tokenIn}` : `Swap ${tokenIn} → ${tokenOut}`;
    setTx({ open: true, phase: "confirm", title, description: kind === "swap" ? "Confirm the swap in your wallet." : undefined });
    await new Promise((r) => setTimeout(r, 900));
    setTx({ open: true, phase: "pending", title });
    await new Promise((r) => setTimeout(r, 1600));
    const ok = Math.random() > 0.08;
    if (ok) {
      const hash = fakeHash();
      setTx({ open: true, phase: "success", title, hash });
      if (kind === "approve") {
        setApproved((p) => ({ ...p, [tokenIn]: true }));
        toast.success(`${tokenIn} approved for swapping`);
      } else {
        toast.success("Swap confirmed", { description: `${amountIn} ${tokenIn} → ${fmtToken(amountOut)} ${tokenOut}` });
        setAmountIn("");
        setQuote({ status: "idle" });
      }
    } else {
      setTx({ open: true, phase: "failed", title, error: "Transaction reverted or was rejected in the wallet. (Simulated failure state)" });
    }
  }

  const buttonState = useMemo((): { label: string; disabled: boolean; action?: () => void; tone?: "danger" } => {
    if (!connected) return { label: "Connect Wallet", disabled: false, action: () => wallet.connect() };
    if (wrongNetwork) return { label: "Switch to Verdex Mainnet", disabled: false, action: () => wallet.switchToVerdex().catch(() => {}) };
    if (amount <= 0) return { label: "Enter an amount", disabled: true };
    if (insufficient) return { label: `Insufficient ${tokenIn} balance`, disabled: true, tone: "danger" };
    if (quote.status === "loading") return { label: "Finding best route…", disabled: true };
    if (quote.status === "error") return { label: quote.message, disabled: true, tone: "danger" };
    if (needsApproval) return { label: `Approve ${tokenIn}`, disabled: false, action: () => runTx("approve") };
    return { label: "Swap", disabled: false, action: () => runTx("swap") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, wrongNetwork, amount, insufficient, quote, needsApproval, tokenIn]);

  return (
    <div className="edge-glow relative w-full max-w-md rounded-3xl border border-line bg-panel p-5 shadow-lift backdrop-blur-2xl sm:p-6">
      {/* header */}
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold text-ink">Swap</h2>
        <div className="flex items-center gap-2">
          <NetworkSelector value={network} onChange={setNetwork} />
          <button
            onClick={() => setShowSettings((v) => !v)}
            aria-label="Swap settings"
            aria-expanded={showSettings}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl border transition-all",
              showSettings ? "border-emerald/50 bg-emerald/10 text-emerald-bright" : "border-line text-muted hover:text-ink"
            )}
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* settings panel */}
      {showSettings && (
        <div className="mb-4 space-y-4 rounded-2xl border border-line bg-black/25 p-4 animate-fade-up">
          <div>
            <Label className="mb-2 flex items-center gap-1.5">
              Slippage tolerance
              <InfoTip content="Your transaction reverts if the price moves against you by more than this percentage." />
            </Label>
            <div className="flex gap-2">
              {[0.1, 0.5, 1.0].map((v) => (
                <button
                  key={v}
                  onClick={() => { setSlippage(v); setCustomSlippage(""); }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                    slippage === v && !customSlippage ? "border-emerald/50 bg-emerald/15 text-emerald-bright" : "border-line text-muted hover:text-ink"
                  )}
                >
                  {v}%
                </button>
              ))}
              <Input
                value={customSlippage}
                onChange={(e) => {
                  setCustomSlippage(e.target.value);
                  const v = parseFloat(e.target.value);
                  if (v > 0 && v <= 50) setSlippage(v);
                }}
                placeholder="Custom"
                className="h-8 w-24 text-xs"
                inputMode="decimal"
                aria-label="Custom slippage percent"
              />
            </div>
          </div>
          <div>
            <Label className="mb-2 flex items-center gap-1.5" htmlFor="deadline">
              Transaction deadline
              <InfoTip content="The transaction reverts if it stays pending longer than this time." />
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="deadline"
                type="number"
                min={1}
                max={180}
                value={deadline}
                onChange={(e) => setDeadline(Math.max(1, parseInt(e.target.value) || 20))}
                className="h-8 w-24 text-xs"
              />
              <span className="text-xs text-muted">minutes</span>
            </div>
          </div>
        </div>
      )}

      {/* you pay */}
      <div className="rounded-2xl border border-line bg-black/25 p-4 transition-colors focus-within:border-emerald/40">
        <div className="mb-2 flex items-center justify-between">
          <Label>You pay</Label>
          <span className="flex items-center gap-2 text-xs text-muted">
            Balance: <span className="mono text-mist">{fmtToken(balanceIn)}</span>
            <button onClick={setMax} className="rounded-md border border-emerald/30 bg-emerald/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-bright transition-colors hover:bg-emerald/20">
              MAX
            </button>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={amountIn}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d*\.?\d*$/.test(v)) setAmountIn(v);
            }}
            placeholder="0.0"
            inputMode="decimal"
            aria-label={`Amount of ${tokenIn} to pay`}
            className="w-full min-w-0 bg-transparent text-2xl font-semibold text-ink outline-none placeholder:text-faint"
          />
          <TokenSelector value={tokenIn} onChange={setTokenIn} balances={DEMO_BALANCES} exclude={tokenOut} label="Select token to pay" />
        </div>
        {insufficient && <p className="mt-2 text-xs font-medium text-danger">Insufficient {tokenIn} balance.</p>}
      </div>

      {/* flip */}
      <div className="relative z-10 -my-2.5 flex justify-center">
        <button
          onClick={flip}
          aria-label="Flip swap direction"
          className="grid h-10 w-10 place-items-center rounded-xl border border-emerald/30 bg-elevate text-emerald-bright shadow-card transition-all hover:rotate-180 hover:border-emerald/60 hover:shadow-glow-sm"
        >
          <ArrowDownUp className="h-4 w-4" />
        </button>
      </div>

      {/* you receive */}
      <div className="rounded-2xl border border-line bg-black/25 p-4">
        <div className="mb-2 flex items-center justify-between">
          <Label>You receive (estimated)</Label>
          <span className="text-xs text-muted">Balance: <span className="mono text-mist">{fmtToken(DEMO_BALANCES[tokenOut] ?? 0)}</span></span>
        </div>
        <div className="flex items-center gap-3">
          {quote.status === "loading" ? (
            <span className="flex items-center gap-2 text-lg text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Finding best route…</span>
          ) : (
            <span className={cn("w-full min-w-0 truncate text-2xl font-semibold", amountOut ? "text-ink" : "text-faint")}>
              {amountOut ? fmtToken(amountOut, 6) : "—"}
            </span>
          )}
          <TokenSelector value={tokenOut} onChange={setTokenOut} balances={DEMO_BALANCES} exclude={tokenIn} label="Select token to receive" />
        </div>
      </div>

      {/* quote details */}
      {quote.status === "ready" && amount > 0 && (
        <div className="mt-4 space-y-2.5 rounded-2xl border border-line bg-black/20 p-4 text-[13px] animate-fade-up">
          <Row k="Rate" v={`1 ${tokenIn} ≈ ${fmtToken(rate, 6)} ${tokenOut}`} />
          <Row k="Price impact" v={`${impact < 0.01 ? "<0.01" : impact.toFixed(2)}%`} tone={impact > 5 ? "danger" : impact > 2 ? "amber" : undefined} tip="Difference between the market price and your execution price due to trade size." />
          <Row k="Minimum received" v={`${fmtToken(minReceived, 6)} ${tokenOut}`} tip="Worst-case output after your slippage tolerance. The transaction reverts below this." />
          <Row k={`LP fee (${FEES.totalPct}%)`} v={`${fmtToken(lpFee, 6)} ${tokenIn}`} tip="0.17% to liquidity providers · 0.05% treasury · 0.03% VDX buyback & burn." />
          <Row k="Network fee" v="≈ 0.0002 VDX" tip="Estimated gas on Verdex Mainnet." />
          <Row k="Route source" v={quote.source === "estimate" ? "Local estimate (RPC unreachable)" : "On-chain router"} />
        </div>
      )}

      {/* route */}
      {quote.status === "ready" && <div className="mt-3"><RouteVisual path={quote.path} gas="0.0002 VDX" /></div>}

      {/* action */}
      <Button
        className="mt-5 w-full"
        size="lg"
        variant={buttonState.tone === "danger" ? "danger" : "primary"}
        disabled={buttonState.disabled}
        onClick={buttonState.action}
      >
        {quote.status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
        {buttonState.label}
      </Button>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-faint">
        <Info className="mt-px h-3 w-3 shrink-0" />
        Quotes are simulated in this preview build — production quotes come from the on-chain router via the bounded RPC bridge. Balances shown are demo values.
      </p>

      <TxStatusModal state={tx} onClose={() => setTx(idleTx)} />
    </div>
  );
}

function Row({ k, v, tip, tone }: { k: string; v: string; tip?: string; tone?: "amber" | "danger" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted">
        {k}
        {tip && <InfoTip content={tip} />}
      </span>
      <span className={cn("mono text-mist", tone === "amber" && "text-amber", tone === "danger" && "text-danger")}>{v}</span>
    </div>
  );
}
