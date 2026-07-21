"use client";

import { useState } from "react";
import { 
  ArrowDownLeft, ArrowUpRight, Copy, QrCode, ShieldCheck, 
  HelpCircle, AlertCircle, Sparkles, Check
} from "lucide-react";
import { formatVP, timeAgo } from "@/lib/utils";

interface WalletClientProps {
  initialVpBalance: number;
  initialAddress: string | null;
  transactions: any[];
}

export function WalletClient({ initialVpBalance, initialAddress, transactions }: WalletClientProps) {
  const [address, setAddress] = useState<string | null>(initialAddress);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const copyToClipboard = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const connectWallet = async () => {
    setConnecting(true);
    setErrorMsg("");
    try {
      const { ethereum } = window as any;
      if (!ethereum) {
        throw new Error("MetaMask is not installed. Please install MetaMask to connect your wallet.");
      }

      // Request accounts
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found. Please unlock MetaMask.");
      }
      const selectedAddress = accounts[0];

      // Sign verification message
      const signature = await ethereum.request({
        method: "personal_sign",
        params: [
          `Verify ownership of this address to link it to your Verdex Miner account:\n\nWallet Address: ${selectedAddress}\nTimestamp: ${Date.now()}`,
          selectedAddress
        ]
      });

      // Synchronize with database via Vercel api endpoint
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vdx_address: selectedAddress })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setAddress(selectedAddress);
      } else {
        throw new Error(data.error || "Failed to update wallet address.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during connection.");
    } finally {
      setConnecting(false);
    }
  };

  const addNetworkToMetaMask = async () => {
    try {
      const { ethereum } = window as any;
      if (!ethereum) return alert("MetaMask not found.");
      
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x1192a", // 72010
          chainName: "Verdex Mainnet",
          nativeCurrency: { name: "VDX", symbol: "VDX", decimals: 18 },
          rpcUrls: ["https://verdexswap.site/api/rpc"],
          blockExplorerUrls: ["https://verdexswap.site/explorer"]
        }]
      });
    } catch (err: any) {
      alert("Error adding network: " + err.message);
    }
  };

  return (
    <div className="space-y-8 py-2">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Balance & Address Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="vdx-card p-7 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-vdx-green/8 to-transparent pointer-events-none" />
            <p className="text-xs text-vdx-muted uppercase tracking-widest font-semibold mb-2">VP Balance</p>
            <div className="font-heading font-800 text-5xl text-vdx-green leading-none mb-1">
              {formatVP(initialVpBalance)}
            </div>
            <p className="text-vdx-muted text-sm mb-6">Verdex Points (VP)</p>

            <p className="text-xs text-vdx-muted leading-relaxed mb-6">
              VP is your pre-TGE mining balance. It will convert to VDX at the TGE once audited mainnet contracts are deployed.
            </p>

            {address ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-vdx-muted uppercase tracking-wider mb-2">Linked VDX Address</p>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-black/25 border border-[rgba(87,255,179,0.1)]">
                    <span className="font-mono text-xs text-vdx-green flex-1 truncate">{address}</span>
                    <button 
                      onClick={copyToClipboard}
                      className="text-vdx-muted hover:text-vdx-green transition-colors flex-shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-vdx-green" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={addNetworkToMetaMask}
                  className="w-full text-xs font-bold py-2.5 rounded-lg bg-vdx-green/10 border border-vdx-green/20 text-vdx-green hover:bg-vdx-green/20 transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Add Verdex Chain to MetaMask
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={connectWallet}
                  disabled={connecting}
                  className="w-full btn-primary py-3 text-sm flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {connecting ? "Connecting..." : "Connect MetaMask"}
                </button>

                {errorMsg && (
                  <div className="p-3 bg-red-950/20 border border-red-900/30 text-vdx-warning text-xs rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Transactions list */}
        <div className="lg:col-span-2 vdx-card p-6">
          <h2 className="font-heading font-bold text-base mb-5">Transaction History</h2>
          {!transactions || transactions.length === 0 ? (
            <div className="text-center py-12">
              <ArrowUpRight className="w-10 h-10 text-vdx-muted/30 mx-auto mb-3" />
              <p className="text-vdx-muted text-sm">No transactions recorded yet.</p>
              <p className="text-xs text-vdx-muted mt-1">Start mining to generate transaction history.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {transactions.map((tx, i) => {
                const isPositive = (tx.amount ?? 0) >= 0;
                return (
                  <div key={tx.id ?? i} className="flex items-center justify-between p-3.5 rounded-xl border border-[rgba(87,255,179,0.05)] hover:border-[rgba(87,255,179,0.12)] transition-all bg-[rgba(36,229,150,0.01)]">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isPositive ? "bg-vdx-green/10" : "bg-vdx-error/10"}`}>
                        {isPositive
                          ? <ArrowDownLeft className="w-3.5 h-3.5 text-vdx-green" />
                          : <ArrowUpRight className="w-3.5 h-3.5 text-vdx-error" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-vdx-text capitalize">{tx.type ?? "transaction"}</p>
                        <p className="text-xs text-vdx-muted">{timeAgo(tx.created_at)}</p>
                      </div>
                    </div>
                    <span className={`font-mono text-sm font-bold ${isPositive ? "text-vdx-green" : "text-vdx-error"}`}>
                      {isPositive ? "+" : ""}{(tx.amount ?? 0).toFixed(4)} VP
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
