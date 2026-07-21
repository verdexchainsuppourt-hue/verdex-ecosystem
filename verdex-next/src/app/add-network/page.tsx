"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Check, ShieldAlert, Network, ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { VERDEX_CONSTANTS } from "@/lib/constants";

export default function AddNetworkPage() {
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const chainIdHex = "0x" + VERDEX_CONSTANTS.proposedChainId.toString(16);

  async function addNetworkToMetaMask() {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setStatus("error");
      setErrorMsg("MetaMask or compatible EVM provider was not detected in this browser.");
      return;
    }

    setStatus("pending");
    setErrorMsg("");

    try {
      await (window as any).ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: VERDEX_CONSTANTS.proposedChainName,
            nativeCurrency: {
              name: VERDEX_CONSTANTS.networkSymbol,
              symbol: VERDEX_CONSTANTS.networkSymbol,
              decimals: VERDEX_CONSTANTS.networkDecimals,
            },
            rpcUrls: [VERDEX_CONSTANTS.links.rpc],
            blockExplorerUrls: [VERDEX_CONSTANTS.links.explorer],
          },
        ],
      });
      setStatus("success");
    } catch (e: any) {
      console.error(e);
      setStatus("error");
      setErrorMsg(e.message || "Failed to add network to your wallet.");
    }
  }

  const details = [
    { label: "Network Name", value: VERDEX_CONSTANTS.proposedChainName },
    { label: "RPC Endpoint", value: VERDEX_CONSTANTS.links.rpc },
    { label: "Chain ID", value: `${VERDEX_CONSTANTS.proposedChainId} (${chainIdHex})` },
    { label: "Currency Symbol", value: VERDEX_CONSTANTS.networkSymbol },
    { label: "Block Explorer", value: VERDEX_CONSTANTS.links.explorer },
  ];

  return (
    <div className="relative min-h-[92vh] flex items-center justify-center overflow-hidden grid-bg py-16 px-4">
      {/* Background glow blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-vdx-green/8 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] rounded-full bg-vdx-cyan/6 blur-[100px]" />
      </div>

      <div className="relative max-w-xl w-full">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-vdx-muted hover:text-vdx-green transition-colors mb-6 group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          Back to home
        </Link>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="vdx-card p-8 sm:p-10 relative overflow-hidden"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-vdx-green/10 border border-vdx-green/20 flex items-center justify-center mx-auto mb-4 drop-shadow-[0_0_15px_rgba(36,229,150,0.2)]">
              <Network className="w-6 h-6 text-vdx-green animate-pulse" />
            </div>
            <h1 className="font-heading text-3xl font-800 tracking-tight">
              Connect to <span className="gradient-text">Verdex</span>
            </h1>
            <p className="text-vdx-muted text-sm mt-2 leading-relaxed">
              Add the Verdex Mainnet QBFT network to your MetaMask or Web3 browser extension in one click.
            </p>
          </div>

          {/* Network details list */}
          <div className="bg-black/35 border border-[rgba(87,255,179,0.08)] rounded-2xl p-5 mb-8 space-y-3.5">
            <h3 className="text-vdx-green font-mono text-[10px] tracking-widest font-semibold uppercase mb-2">
              Network Parameters
            </h3>
            {details.map((d) => (
              <div key={d.label} className="flex justify-between items-start gap-4 text-sm py-1.5 border-b border-[rgba(87,255,179,0.05)] last:border-0">
                <span className="text-vdx-muted text-xs">{d.label}</span>
                <span
                  onClick={() => navigator.clipboard.writeText(d.value.toString())}
                  className="font-mono text-xs text-vdx-text font-bold hover:text-vdx-green cursor-pointer transition-colors break-all text-right"
                  title="Click to copy"
                >
                  {d.value}
                </span>
              </div>
            ))}
          </div>

          {/* Status Message */}
          {status === "error" && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-vdx-error/8 border border-vdx-error/20 text-xs text-vdx-error mb-6">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">{errorMsg}</p>
            </div>
          )}

          {status === "success" && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-vdx-green/8 border border-vdx-green/20 text-xs text-vdx-green mb-6">
              <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">Verdex Mainnet successfully added to your Web3 provider!</p>
            </div>
          )}

          {/* Action button */}
          <button
            onClick={addNetworkToMetaMask}
            disabled={status === "pending"}
            className="w-full btn-primary text-base py-4 font-bold flex justify-center items-center gap-2 drop-shadow-[0_4px_12px_rgba(36,229,150,0.15)] active:scale-[0.98] transition-transform"
          >
            {status === "pending" ? (
              <>Connecting Wallet...</>
            ) : status === "success" ? (
              <>
                <Check className="w-5 h-5" /> Connected
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" /> Add to MetaMask
              </>
            )}
          </button>

          {/* Verification note */}
          <p className="text-[10px] text-vdx-muted text-center mt-5">
            Bypass third-party configs. Connecting directly utilizes our QBFT validator endpoint:{" "}
            <span className="font-mono text-vdx-green">{VERDEX_CONSTANTS.links.rpc}</span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
