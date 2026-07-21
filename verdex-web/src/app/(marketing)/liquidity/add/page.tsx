"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ChevronLeft, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { TokenSelector } from "@/components/swap/token-selector";
import { NetworkSelector } from "@/components/wallet/network-selector";
import { TxStatusModal, idleTx, type TxModalState } from "@/components/shared/tx-status-modal";
import { RiskBadge } from "@/components/shared/risk-badge";
import { InfoTip } from "@/components/ui/tooltip";
import { FEES, TOKENS } from "@/lib/constants";
import { POOLS } from "@/lib/mock-data";
import { fmtPct, fmtToken, fmtUSD } from "@/lib/format";
import { cn } from "@/lib/utils";

const DEMO_BALANCES: Record<string, number> = { VDX: 1240.5, WVDX: 860.25, USDT: 5320.0, ALP: 148.6, USDC: 2100.0 };
const STEPS = ["Network & Pair", "Amounts", "Review & Risks", "Confirm"];

function AddLiquidityWizard() {
  const params = useSearchParams();
  const preset = POOLS.find((p) => p.id === params.get("pool"));

  const [step, setStep] = useState(0);
  const [network, setNetwork] = useState("verdex");
  const [tokenA, setTokenA] = useState(preset?.tokenA ?? "WVDX");
  const [tokenB, setTokenB] = useState(preset?.tokenB ?? "USDT");
  const [feeTier, setFeeTier] = useState(preset?.feeTier ?? 0.25);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [risksAccepted, setRisksAccepted] = useState(false);
  const [tx, setTx] = useState<TxModalState>(idleTx);
  const [done, setDone] = useState(false);

  const pool = POOLS.find((p) => (p.tokenA === tokenA && p.tokenB === tokenB) || (p.tokenA === tokenB && p.tokenB === tokenA));
  const amtA = parseFloat(amountA) || 0;
  const amtB = parseFloat(amountB) || 0;
  const usdA = amtA * (TOKENS[tokenA]?.price ?? 0);
  const usdB = amtB * (TOKENS[tokenB]?.price ?? 0);
  const totalUsd = usdA + usdB;
  const poolShare = pool ? Math.min(100, (totalUsd / (pool.tvl + totalUsd)) * 100) : 0;
  const estApy = pool?.apy ?? 0;
  const insufficientA = amtA > (DEMO_BALANCES[tokenA] ?? 0);
  const insufficientB = amtB > (DEMO_BALANCES[tokenB] ?? 0);
  const ratio = amtA > 0 && amtB > 0 ? amtB / amtA : 0;

  function ratioLink(which: "A" | "B", value: string) {
    const v = parseFloat(value) || 0;
    const priceA = TOKENS[tokenA]?.price ?? 1;
    const priceB = TOKENS[tokenB]?.price ?? 1;
    if (which === "A") {
      setAmountA(value);
      setAmountB(v > 0 ? ((v * priceA) / priceB).toFixed(6) : "");
    } else {
      setAmountB(value);
      setAmountA(v > 0 ? ((v * priceB) / priceA).toFixed(6) : "");
    }
  }

  const canNext = useMemo(() => {
    if (step === 0) return tokenA !== tokenB;
    if (step === 1) return amtA > 0 && amtB > 0 && !insufficientA && !insufficientB;
    if (step === 2) return risksAccepted;
    return true;
  }, [step, tokenA, tokenB, amtA, amtB, insufficientA, insufficientB, risksAccepted]);

  async function confirm() {
    setTx({ open: true, phase: "confirm", title: "Add Liquidity", description: "Approve both tokens, then confirm the deposit in your wallet." });
    await new Promise((r) => setTimeout(r, 1000));
    setTx({ open: true, phase: "pending", title: "Add Liquidity" });
    await new Promise((r) => setTimeout(r, 1800));
    const hash = "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    setTx({ open: true, phase: "success", title: "Liquidity Added", hash });
    setDone(true);
    toast.success("Liquidity position created (simulated)");
  }

  return (
    <div className="mx-auto max-w-xl">
      {/* stepper */}
      <ol className="mb-8 flex items-center gap-2" aria-label="Add liquidity progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span className={cn("h-1 rounded-full transition-all", i <= step ? "bg-gradient-to-r from-emerald-dim to-emerald" : "bg-white/10")} />
            <span className={cn("text-[10px] font-semibold uppercase tracking-wide", i === step ? "text-emerald-bright" : "text-faint")}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      <Card className="edge-glow p-6 sm:p-7">
        {step === 0 && (
          <div className="space-y-5 animate-fade-up">
            <h1 className="font-heading text-xl font-bold text-ink">Select network & pair</h1>
            <div>
              <Label className="mb-2 block">Network</Label>
              <NetworkSelector value={network} onChange={setNetwork} className="w-full justify-between" />
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
              <div>
                <Label className="mb-2 block">Token A</Label>
                <div className="rounded-2xl border border-line bg-black/25 p-3">
                  <TokenSelector value={tokenA} onChange={setTokenA} exclude={tokenB} label="Select first token" />
                </div>
              </div>
              <span className="pb-4 text-faint">+</span>
              <div>
                <Label className="mb-2 block">Token B</Label>
                <div className="rounded-2xl border border-line bg-black/25 p-3">
                  <TokenSelector value={tokenB} onChange={setTokenB} exclude={tokenA} label="Select second token" />
                </div>
              </div>
            </div>
            <div>
              <Label className="mb-2 flex items-center gap-1.5">
                Fee tier
                <InfoTip content="The share of each trade paid to this pool's liquidity providers. Higher tiers suit volatile pairs." />
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {[0.05, 0.25, 0.3].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFeeTier(f)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all",
                      feeTier === f ? "border-emerald/50 bg-emerald/15 text-emerald-bright" : "border-line text-muted hover:text-ink"
                    )}
                    aria-pressed={feeTier === f}
                  >
                    {f}%
                  </button>
                ))}
              </div>
            </div>
            {tokenA === tokenB && <p className="text-sm text-danger">Select two different tokens.</p>}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5 animate-fade-up">
            <h2 className="font-heading text-xl font-bold text-ink">Deposit amounts</h2>
            {([["A", tokenA, amountA, insufficientA], ["B", tokenB, amountB, insufficientB]] as const).map(([which, sym, amt, insufficient]) => (
              <div key={which} className="rounded-2xl border border-line bg-black/25 p-4 focus-within:border-emerald/40">
                <div className="mb-2 flex items-center justify-between">
                  <Label>{sym}</Label>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    Balance: <span className="mono text-mist">{fmtToken(DEMO_BALANCES[sym] ?? 0)}</span>
                    <button
                      onClick={() => ratioLink(which, String(DEMO_BALANCES[sym] ?? 0))}
                      className="rounded-md border border-emerald/30 bg-emerald/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-bright hover:bg-emerald/20"
                    >
                      MAX
                    </button>
                  </span>
                </div>
                <input
                  value={amt}
                  onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && ratioLink(which, e.target.value)}
                  placeholder="0.0"
                  inputMode="decimal"
                  aria-label={`Amount of ${sym}`}
                  className="w-full bg-transparent text-2xl font-semibold text-ink outline-none placeholder:text-faint"
                />
                {insufficient && <p className="mt-1.5 text-xs text-danger">Insufficient {sym} balance.</p>}
              </div>
            ))}
            <p className="text-xs text-faint">Amounts auto-balance to equal USD value, as required by the AMM.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 animate-fade-up">
            <h2 className="font-heading text-xl font-bold text-ink">Review & risks</h2>
            <div className="space-y-2.5 rounded-2xl border border-line bg-black/25 p-4 text-sm">
              <Review k="Pool" v={`${tokenA} / ${tokenB}`} />
              <Review k="Exchange ratio" v={`1 ${tokenA} ≈ ${fmtToken(ratio, 6)} ${tokenB}`} />
              <Review k="Fee tier" v={`${feeTier}%`} />
              <Review k="Est. pool share" v={fmtPct(poolShare, 4)} />
              <Review k="Est. yield (variable)" v={pool ? fmtPct(estApy) : "New pool"} />
              <Review k="Est. yearly fees (at current rate)" v={fmtUSD((totalUsd * estApy) / 100)} />
              <Review k="Deposit value" v={fmtUSD(totalUsd)} />
              {pool && <Review k="Pool risk level" v={<RiskBadge level={pool.risk} />} />}
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-amber/25 bg-amber/[0.06] p-4 text-sm text-amber">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Understand the risks</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-amber/90">
                  <li>Impermanent loss if the price ratio of the pair changes.</li>
                  <li>Variable yield — APY depends on volume and emissions.</li>
                  <li>Smart-contract interaction risk on pre-mainnet software.</li>
                </ul>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-mist">
              <input
                type="checkbox"
                checked={risksAccepted}
                onChange={(e) => setRisksAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-line bg-black/40 accent-emerald"
              />
              I understand these risks and confirm this is not a guaranteed yield.
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 text-center animate-fade-up">
            {done ? (
              <>
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-emerald/40 bg-emerald/10 animate-block-pop">
                  <Check className="h-8 w-8 text-emerald-bright" />
                </span>
                <h2 className="font-heading text-xl font-bold text-ink">Position created</h2>
                <p className="text-sm text-muted">
                  You deposited {fmtToken(amtA)} {tokenA} + {fmtToken(amtB)} {tokenB} ({fmtUSD(totalUsd)}).
                  Track it anytime from your dashboard.
                </p>
              </>
            ) : (
              <>
                <h2 className="font-heading text-xl font-bold text-ink">Confirm transaction</h2>
                <p className="text-sm text-muted">
                  You&apos;ll approve {tokenA} and {tokenB}, then sign the deposit.
                  Total: <span className="mono text-emerald-bright">{fmtUSD(totalUsd)}</span>
                </p>
                <Button size="lg" className="w-full" onClick={confirm}>
                  Approve & Add Liquidity
                </Button>
              </>
            )}
          </div>
        )}

        {/* nav */}
        <div className="mt-7 flex items-center justify-between border-t border-line pt-5">
          <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < 3 && (
            <Button size="sm" onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext}>
              Continue
            </Button>
          )}
        </div>
      </Card>

      <TxStatusModal state={tx} onClose={() => setTx(idleTx)} />
    </div>
  );
}

function Review({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="mono text-mist">{v}</span>
    </div>
  );
}

export default function AddLiquidityPage() {
  return (
    <div className="container pb-24 pt-28 lg:pt-32">
      <Suspense fallback={<div className="mx-auto max-w-xl"><Card className="h-96 animate-pulse" /></div>}>
        <AddLiquidityWizard />
      </Suspense>
    </div>
  );
}
