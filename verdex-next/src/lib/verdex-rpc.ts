import { VERDEX_API_BASE } from "@/lib/constants";

export interface NetworkConfig {
  configured: boolean;
  chainId: number | null;
  chainIdHex: string | null;
  chainName: string;
  symbol: string;
  decimals: number;
  rpcUrl: string | null;
  explorerUrl: string | null;
  contracts: Record<string, string> | null;
}

export interface AMMQuote {
  amountOut: string;
  path: string[];
  fee: number;
  route: string;
}

/** Fetch live network config from /api/network (same-origin proxy) */
export async function fetchNetworkConfig(): Promise<NetworkConfig> {
  try {
    const res = await fetch(`${VERDEX_API_BASE}/network`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("network config unavailable");
    const json = await res.json();
    if (!json.success || !json.network?.chainId) {
      return { configured: false, chainId: null, chainIdHex: null, chainName: "Verdex Mainnet", symbol: "VDX", decimals: 18, rpcUrl: null, explorerUrl: null, contracts: null };
    }
    return { configured: true, ...json.network };
  } catch {
    return { configured: false, chainId: null, chainIdHex: null, chainName: "Verdex Mainnet", symbol: "VDX", decimals: 18, rpcUrl: null, explorerUrl: null, contracts: null };
  }
}

/** Get AMM quote from the Railway RPC via same-origin proxy */
export async function fetchAMMQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string
): Promise<AMMQuote | null> {
  try {
    const rpcBase = "https://verdex-ecosystem-production.up.railway.app";
    const ammContract = "0x01d23206724793af4d26104946094333282db48e";

    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        {
          to: ammContract,
          data: JSON.stringify({ method: "findBestRoute", args: [tokenIn, tokenOut, amountIn] }),
        },
        "latest",
      ],
    };

    const res = await fetch(`${rpcBase}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    const json = await res.json();
    if (json.error || !json.result || json.result === "0x") return null;

    const result = typeof json.result === "string" ? JSON.parse(json.result) : json.result;
    return {
      amountOut: result.amountOut || result.result?.amountOut || "0",
      path: result.path || result.result?.path || [tokenIn, tokenOut],
      fee: 0.25,
      route: (result.path || [tokenIn, tokenOut]).join(" → "),
    };
  } catch {
    return null;
  }
}

/** Convert decimal string to wei (18 decimals) */
export function toWei(n: string | number): bigint {
  const s = String(n);
  if (!s || isNaN(Number(s))) return BigInt(0);
  const [w, f = ""] = s.split(".");
  const frac = (f + "000000000000000000").slice(0, 18);
  return BigInt(w || "0") * (BigInt(10) ** BigInt(18)) + BigInt(frac || "0");
}

/** Convert wei bigint to decimal string */
export function fromWei(bi: bigint): string {
  const s = bi.toString().padStart(19, "0");
  const whole = s.slice(0, -18) || "0";
  const frac = s.slice(-18).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** Local constant-product estimate (fallback when RPC unavailable) */
export function localAMMEstimate(amountIn: number): number {
  return amountIn * 0.9975; // 0.25% fee
}
