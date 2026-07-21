import type { DownloadInfo, Network, Token } from "./types";

/** API base of the production backend. Override with NEXT_PUBLIC_API_BASE. */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export const CHAIN = {
  name: "Verdex Mainnet",
  proposedChainId: 72010,
  chainIdHex: "0x1193A",
  symbol: "VDX",
  decimals: 18,
  consensus: "PoA (Besu QBFT)",
  explorerUrl: "https://verdexswap.site/explorer",
  websiteUrl: "https://verdexswap.site",
} as const;

export const NETWORKS: Network[] = [
  { id: "verdex", name: "Verdex Mainnet", shortName: "Verdex", chainId: 72010, color: "#24E596", isDefault: true },
  { id: "ethereum", name: "Ethereum", shortName: "ETH", chainId: 1, color: "#627EEA", upcoming: true },
  { id: "bsc", name: "BNB Chain", shortName: "BSC", chainId: 56, color: "#F0B90B", upcoming: true },
  { id: "polygon", name: "Polygon", shortName: "MATIC", chainId: 137, color: "#28A0F0", upcoming: true },
];

/** Tokens with live pools on Verdex Swap today (WVDX / USDT / ALP) + VDX. */
export const TOKENS: Record<string, Token> = {
  VDX: { symbol: "VDX", name: "Verdex", decimals: 18, color: "#24E596", price: 0.42 },
  WVDX: { symbol: "WVDX", name: "Wrapped VDX", decimals: 18, color: "#0F8A57", price: 0.42 },
  USDT: { symbol: "USDT", name: "Tether USD", decimals: 6, color: "#26A17B", price: 1, isStable: true },
  ALP: { symbol: "ALP", name: "Alpha LP", decimals: 18, color: "#22D3EE", price: 2.14 },
  USDC: { symbol: "USDC", name: "USD Coin", decimals: 6, color: "#2775CA", price: 1, isStable: true },
};

export const TOKEN_LIST: Token[] = Object.values(TOKENS);

export const FEES = {
  totalPct: 0.25,
  lpPct: 0.17,
  treasuryPct: 0.05,
  burnPct: 0.03,
} as const;

export const LINKS = {
  explorer: "https://verdexswap.site/explorer",
  whitepaperPdf: "https://verdexswap.site/assets/verdex-whitepaper.pdf",
  windowsMiner: "https://verdexswap.site/updates/Verdex-Miner-Setup-4.0.2.exe",
  androidMiner: "https://verdexswap.site/assets/downloads/Verdex-Android-1.9.5-build42.apk",
  github: "https://github.com/verdexchainsuppourt-hue/verdex-ecosystem",
  x: "https://x.com/VerdexSwap",
  discord: "https://discord.gg/verdex",
  telegram: "https://t.me/VerdixOffical",
  tiktok: "https://www.tiktok.com/@blockchaindevolper",
} as const;

/** Real published downloads. Checksum shown as "verify on download page" until published. */
export const DOWNLOADS: DownloadInfo[] = [
  {
    os: "Windows",
    version: "v4.0.2",
    date: "2026-06-28",
    size: "≈ 78 MB",
    file: LINKS.windowsMiner,
    sha256: "published-on-release-page",
    notes: ["GUI miner with auto-update on launch", "Windows 10/11 64-bit", "KYC/P2P ready"],
  },
  {
    os: "Android",
    version: "v1.9.5 (build 42)",
    date: "2026-06-20",
    size: "≈ 32 MB",
    file: LINKS.androidMiner,
    sha256: "published-on-release-page",
    notes: ["APK direct install", "Background mining service", "Auto-update on launch"],
  },
  {
    os: "Linux CLI",
    version: "v4.0.2",
    date: "2026-06-28",
    size: "≈ 18 MB",
    file: "/dashboard/downloads",
    sha256: "published-on-release-page",
    notes: ["Headless CLI for servers", "API-token authentication", "systemd service example in docs"],
  },
];

export const FAQ_HOME_LINKS = {
  docs: "/docs",
  security: "/security",
} as const;
