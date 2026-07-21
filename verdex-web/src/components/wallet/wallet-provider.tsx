"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { API_BASE, CHAIN } from "@/lib/constants";

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window { ethereum?: Eip1193Provider }
}

export type WalletStatus = "disconnected" | "connecting" | "connected";

interface WalletState {
  status: WalletStatus;
  address: string | null;
  chainId: number | null;
  isVerdexNetwork: boolean;
  hasProvider: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToVerdex: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

/** Mirrors production js/network-config.js → addVerdexToWallet(). */
async function fetchMetamaskParams() {
  const res = await fetch(`${API_BASE}/api/network`, { headers: { accept: "application/json" } });
  const json = await res.json().catch(() => ({}));
  const n = json?.network;
  if (!res.ok || !json?.success || !n?.chainId) {
    // Fall back to the proposed mainnet values (same as production defaults).
    return {
      chainId: CHAIN.chainIdHex,
      chainName: CHAIN.name,
      nativeCurrency: { name: "Verdex", symbol: CHAIN.symbol, decimals: CHAIN.decimals },
      rpcUrls: [`${API_BASE || "https://verdexswap.site"}/api/rpc`],
      blockExplorerUrls: [CHAIN.explorerUrl],
    };
  }
  return {
    chainId: n.chainIdHex,
    chainName: n.chainName,
    nativeCurrency: { name: "Verdex", symbol: n.symbol, decimals: n.decimals },
    rpcUrls: [n.rpcUrl || `${API_BASE || "https://verdexswap.site"}/api/rpc`],
    blockExplorerUrls: [n.explorerUrl || CHAIN.explorerUrl],
  };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const hasProvider = typeof window !== "undefined" && !!window.ethereum;

  useEffect(() => {
    if (!hasProvider || !window.ethereum?.on) return;
    const eth = window.ethereum;
    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      if (!list?.length) { setAddress(null); setStatus("disconnected"); }
      else { setAddress(list[0]); setStatus("connected"); }
    };
    const onChain = (hex: unknown) => setChainId(parseInt(hex as string, 16));
    eth.on!("accountsChanged", onAccounts);
    eth.on!("chainChanged", onChain);
    // eager (silent) account check
    eth.request({ method: "eth_accounts" }).then((a) => {
      const list = a as string[];
      if (list?.length) { setAddress(list[0]); setStatus("connected"); }
    }).catch(() => {});
    eth.request({ method: "eth_chainId" }).then((hex) => setChainId(parseInt(hex as string, 16))).catch(() => {});
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [hasProvider]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      toast.error("No EIP-1193 wallet found", { description: "Install MetaMask or another compatible wallet." });
      return;
    }
    setStatus("connecting");
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accounts[0]);
      setStatus("connected");
      const hex = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      setChainId(parseInt(hex, 16));
      toast.success("Wallet connected");
    } catch (e) {
      setStatus("disconnected");
      toast.error("Connection rejected", { description: e instanceof Error ? e.message : undefined });
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setStatus("disconnected");
  }, []);

  const switchToVerdex = useCallback(async () => {
    if (!window.ethereum) return;
    const params = await fetchMetamaskParams();
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: params.chainId }] });
      toast.success("Switched to Verdex Mainnet");
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [params] });
        toast.success("Verdex Mainnet added to your wallet");
      } else {
        toast.error("Network switch rejected");
        throw err;
      }
    }
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      status, address, chainId, hasProvider,
      isVerdexNetwork: chainId === CHAIN.proposedChainId,
      connect, disconnect, switchToVerdex,
    }),
    [status, address, chainId, hasProvider, connect, disconnect, switchToVerdex]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
