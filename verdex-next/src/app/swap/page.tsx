"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, Settings2, Copy, ExternalLink, RefreshCw, ChevronDown, AlertTriangle, Info } from "lucide-react";
import { VERDEX_CONSTANTS } from "@/lib/constants";
import { fetchAMMQuote, toWei, fromWei, localAMMEstimate } from "@/lib/verdex-rpc";
import { cn, copyToClipboard } from "@/lib/utils";
import type { Metadata } from "next";

const TOKENS = [
  { symbol: "ALP", name: "Verdex ALP", color: "#24E596" },
  { symbol: "WVDX", name: "Wrapped VDX", color: "#57FFB3" },
  { symbol: "USDT", name: "Tether USD", color: "#22D3EE" },
];

type TxState = "idle" | "loading" | "success" | "error";

export default function SwapPage() {
  const [tokenIn, setTokenIn] = useState("ALP");
  const [tokenOut, setTokenOut] = useState("USDT");
  const [amountIn, setAmountIn] = useState("1");
  const [amountOut, setAmountOut] = useState("");
  const [slippage, setSlippage] = useState(0.5);
  const [route, setRoute] = useState("querying…");
  const [quoteState, setQuoteState] = useState<TxState>("idle");
  const [showSettings, setShowSettings] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);

  const ammAddr = VERDEX_CONSTANTS.amm.contractFull;
  const ammShort = VERDEX_CONSTANTS.amm.contractShort;

  const fetchQuote = useCallback(async () => {
    if (!amountIn || Number(amountIn) <= 0 || tokenIn === tokenOut) {
      setAmountOut(tokenIn === tokenOut ? "" : "");
      setRoute(tokenIn === tokenOut ? "Select different tokens" : "Enter an amount");
      return;
    }
    setQuoteState("loading");
    setRoute("Finding best route…");
    try {
      const weiIn = toWei(amountIn).toString();
      const result = await fetchAMMQuote(tokenIn, tokenOut, weiIn);
      if (result) {
        setAmountOut(parseFloat(fromWei(BigInt(result.amountOut))).toFixed(6));
        setRoute(result.route + ` · ${result.fee}% fee applied`);
        setQuoteState("idle");
      } else {
        // Fallback local estimate
        const est = localAMMEstimate(Number(amountIn));
        setAmountOut(est.toFixed(6));
        setRoute(`${tokenIn} → ${tokenOut} · offline estimate`);
        setQuoteState("idle");
      }
    } catch {
      const est = localAMMEstimate(Number(amountIn));
      setAmountOut(est.toFixed(6));
      setRoute(`${tokenIn} → ${tokenOut} · offline estimate`);
      setQuoteState("idle");
    }
  }, [amountIn, tokenIn, tokenOut]);

  // Debounced quote refresh
  useEffect(() => {
    const t = setTimeout(fetchQuote, 350);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  function flipTokens() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn(amountOut || "1");
    setAmountOut("");
  }

  function handleCopyAddr() {
    copyToClipboard(ammAddr);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  }

  return (
    <div className="min-h-screen py-16 px-4 relative grid-bg">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-vdx-green/6 blur-[100px] pointer-events-none" />

      <div className="relative max-w-lg mx-auto">
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <span className="section-tag mb-3 block">Decentralized Swap</span>
          <h1 className="font-heading text-4xl font-800 tracking-tight">Verdex Swap</h1>
          <p className="text-vdx-muted text-sm mt-2">AMM aggregator · multi-hop routing · constant product x×y=k</p>
        </motion.div>

        {/* Status banner */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-start gap-3 mb-4 p-4 rounded-xl bg-[rgba(245,185,66,0.08)] border border-[rgba(245,185,66,0.2)]"
        >
          <AlertTriangle className="w-4 h-4 text-vdx-warning flex-shrink-0 mt-0.5" />
          <div className="text-xs text-vdx-muted leading-relaxed">
            <strong className="text-vdx-warning">Quote Live — Execution Pending.</strong>{" "}
            AMM quotes are fetched live from the Verdex contract. Wallet-signed swap execution is coming in the next release.
          </div>
        </motion.div>

        {/* Main swap card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="glass-darker rounded-2xl p-6 shadow-[0_32px_80px_rgba(0,0,0,0.5)]"
        >
          {/* Card header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading font-bold text-lg">Swap</h2>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                showSettings ? "bg-vdx-green/20 text-vdx-green" : "text-vdx-muted hover:text-vdx-text hover:bg-white/5"
              )}
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-5 p-4 rounded-xl bg-black/20 border border-[rgba(87,255,179,0.1)] space-y-3"
            >
              <div>
                <label className="text-xs text-vdx-muted uppercase tracking-wider mb-2 block">Slippage Tolerance</label>
                <div className="flex gap-2">
                  {[0.1, 0.5, 1.0].map((v) => (
                    <button
                      key={v}
                      onClick={() => setSlippage(v)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all",
                        slippage === v ? "bg-vdx-green text-vdx-bg" : "bg-white/5 text-vdx-muted hover:bg-white/10"
                      )}
                    >
                      {v}%
                    </button>
                  ))}
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(Number(e.target.value))}
                    className="w-16 text-center py-1.5 rounded-lg text-xs bg-white/5 border border-[rgba(87,255,179,0.1)] text-vdx-text outline-none focus:border-vdx-green/40"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* You Pay */}
          <div className="group p-4 rounded-xl bg-black/30 border border-[rgba(87,255,179,0.08)] focus-within:border-[rgba(36,229,150,0.35)] focus-within:shadow-[0_0_0_3px_rgba(36,229,150,0.08)] transition-all mb-2">
            <label className="text-[10px] uppercase tracking-widest text-vdx-muted font-semibold block mb-2">You Pay</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                placeholder="0.0"
                min="0"
                className="flex-1 bg-transparent outline-none text-2xl font-semibold text-vdx-text min-w-0 [appearance:textfield]"
              />
              <div className="relative">
                <select
                  value={tokenIn}
                  onChange={(e) => setTokenIn(e.target.value)}
                  className="appearance-none bg-vdx-green/15 border border-vdx-green/30 text-vdx-green rounded-xl px-3 pr-7 py-2 text-sm font-bold cursor-pointer outline-none hover:bg-vdx-green/25 transition-all"
                >
                  {TOKENS.filter((t) => t.symbol !== tokenOut).map((t) => (
                    <option key={t.symbol} value={t.symbol} className="bg-vdx-section">
                      {t.symbol}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-vdx-green pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Flip arrow */}
          <div className="flex justify-center my-1">
            <button
              onClick={flipTokens}
              className="w-9 h-9 rounded-xl bg-[rgba(36,229,150,0.08)] border border-[rgba(87,255,179,0.15)] flex items-center justify-center text-vdx-green hover:bg-vdx-green hover:text-vdx-bg hover:rotate-180 transition-all duration-300 hover:shadow-[0_0_20px_rgba(36,229,150,0.3)]"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>

          {/* You Receive */}
          <div className="p-4 rounded-xl bg-black/30 border border-[rgba(87,255,179,0.08)] mb-5">
            <label className="text-[10px] uppercase tracking-widest text-vdx-muted font-semibold block mb-2">You Receive (est.)</label>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-2xl font-semibold font-mono text-vdx-text min-w-0 truncate">
                {quoteState === "loading" ? (
                  <span className="text-vdx-muted text-base animate-pulse">Fetching…</span>
                ) : amountOut ? (
                  amountOut
                ) : (
                  <span className="text-vdx-muted/40">—</span>
                )}
              </div>
              <div className="relative">
                <select
                  value={tokenOut}
                  onChange={(e) => setTokenOut(e.target.value)}
                  className="appearance-none bg-vdx-green/15 border border-vdx-green/30 text-vdx-green rounded-xl px-3 pr-7 py-2 text-sm font-bold cursor-pointer outline-none hover:bg-vdx-green/25 transition-all"
                >
                  {TOKENS.filter((t) => t.symbol !== tokenIn).map((t) => (
                    <option key={t.symbol} value={t.symbol} className="bg-vdx-section">
                      {t.symbol}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-vdx-green pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Fee pills */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { label: "LPs", value: "0.17%" },
              { label: "Treasury", value: "0.05%" },
              { label: "Burn", value: "0.03%" },
            ].map((f) => (
              <div key={f.label} className="text-center p-2.5 rounded-xl bg-black/20 border border-[rgba(87,255,179,0.07)]">
                <div className="font-mono text-sm font-bold text-vdx-green">{f.value}</div>
                <div className="text-[10px] text-vdx-muted mt-0.5">{f.label}</div>
              </div>
            ))}
          </div>

          {/* Route display */}
          <div className="p-3 rounded-xl bg-vdx-green/5 border border-dashed border-[rgba(87,255,179,0.2)] mb-5">
            <div className="flex items-center gap-2">
              <RefreshCw className={cn("w-3 h-3 text-vdx-muted flex-shrink-0", quoteState === "loading" && "animate-spin text-vdx-green")} />
              <span className="text-xs font-mono text-vdx-muted break-all">{route}</span>
            </div>
          </div>

          {/* Swap button */}
          <button
            onClick={fetchQuote}
            disabled={quoteState === "loading"}
            className="btn-primary w-full py-4 text-base justify-center"
          >
            {quoteState === "loading" ? "Fetching Quote…" : "Refresh Quote"}
          </button>

          <p className="text-center text-xs text-vdx-muted/60 mt-3">
            Quotes are fetched live. Wallet-signed execution coming soon.
          </p>
        </motion.div>

        {/* Contract info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-5 p-4 rounded-xl glass text-xs font-mono space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-vdx-muted">Contract</span>
            <div className="flex items-center gap-2">
              <span className="text-vdx-green">{ammShort}</span>
              <button onClick={handleCopyAddr} className="text-vdx-muted hover:text-vdx-green transition-colors">
                <Copy className="w-3 h-3" />
              </button>
              <a
                href={`https://verdexswap.site/explorer/address/${ammAddr}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-vdx-muted hover:text-vdx-green transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-vdx-muted">Fee total</span>
            <span className="text-vdx-text">0.25%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-vdx-muted">Formula</span>
            <span className="text-vdx-text">amountOut = (in × 9975 × rOut) / (rIn × 10000 + in × 9975)</span>
          </div>
          <div className="flex items-center gap-4 pt-1 border-t border-[rgba(87,255,179,0.08)]">
            <a href="/whitepaper" className="text-vdx-green hover:text-vdx-bright transition-colors">Whitepaper</a>
            <a href="/docs" className="text-vdx-green hover:text-vdx-bright transition-colors">Dev Docs</a>
            <a href="https://verdexswap.site/explorer" target="_blank" rel="noopener noreferrer" className="text-vdx-green hover:text-vdx-bright transition-colors">Explorer</a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
