/**
 * Typed client for the production Verdex serverless API.
 * Every call degrades gracefully — hooks return `undefined` on failure so the
 * UI can show its error/offline state instead of crashing.
 */
import { API_BASE } from "./constants";
import { supabase } from "./supabase";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req<T>(path: string, init?: RequestInit, auth = false): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", ...(auth ? await authHeader() : {}) };
  if (init?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...(init?.headers as object) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

/* ---------- network ---------- */
export interface NetworkConfig {
  success: boolean;
  network?: {
    chainId: number;
    chainIdHex: string;
    chainName: string;
    symbol: string;
    decimals: number;
    consensus: string;
    rpcUrl?: string;
    explorerUrl?: string;
    contracts?: Record<string, string>;
  };
}
export const getNetworkConfig = () => req<NetworkConfig>("/api/network");

/* ---------- chain stats (landing hero) ---------- */
export interface ChainStats {
  success: boolean;
  data?: { height: number; totalTransactions: number };
}
export const getChainStats = () => req<ChainStats>("/api/stats").catch(() => ({ success: false } as ChainStats));

/* ---------- mining ---------- */
export interface MiningStatus {
  success: boolean;
  wallet?: { vp_balance?: number; total_vp?: number };
  activeSession?: { started_at?: string; last_heartbeat_at?: string; status?: string } | null;
  uptimeToday?: number;
  rank?: number | null;
  sessions?: unknown[];
}
export const getMiningStatus = () => req<MiningStatus>("/api/mining?action=status", undefined, true);

export interface LeaderboardEntry { rank: number; label: string; vp: number }
export const getLeaderboard = () =>
  req<{ success: boolean; leaderboard?: LeaderboardEntry[] }>("/api/mining?action=leaderboard");

export const requestPayout = () =>
  req<{ success: boolean; message?: string }>("/api/mining?action=payout", { method: "POST" }, true);

export const createMinerToken = (name: string, deviceName?: string) =>
  req<{ success: boolean; token?: string; error?: string }>(
    "/api/mining?action=token-create",
    { method: "POST", body: JSON.stringify({ name, device_name: deviceName ?? null }) },
    true
  );

/* ---------- swap quotes (same eth_call flow as production swap.html) ---------- */
export interface RouteQuote {
  amountOut: string;
  path: string[];
}
export async function getSwapQuote(rpcBase: string, amm: string, tokenIn: string, tokenOut: string, amountWei: string): Promise<RouteQuote> {
  const res = await fetch(`${rpcBase}/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: amm, data: JSON.stringify({ method: "findBestRoute", args: [tokenIn, tokenOut, amountWei] }) }, "latest"],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  const parsed = typeof json.result === "string" ? JSON.parse(json.result) : json.result;
  const route = parsed?.result ?? parsed;
  if (!route?.amountOut) throw new Error("No route available");
  return { amountOut: String(route.amountOut), path: route.path ?? [tokenIn, tokenOut] };
}

/* ---------- waitlist ---------- */
export const joinWaitlist = (email: string) =>
  req<{ success: boolean; message?: string }>("/api/waitlist", { method: "POST", body: JSON.stringify({ email }) });
