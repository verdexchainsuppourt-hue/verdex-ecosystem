// Verdex platform constants — all values from live site analysis
// DO NOT add fake values here

export const VERDEX_CONSTANTS = {
  // ─── Brand ──────────────────────────────────────────────────────────────
  name: "Verdex",
  tagline: "Swap Smart. Grow Green.",
  description:
    "Verdex combines decentralized token swaps, intelligent routing, liquidity tools and the VDX mining ecosystem in one self-custodial platform.",

  // ─── Network (from /api/network — fetched at runtime) ───────────────────
  proposedChainId: 72010, // Not final — pending validator ceremony
  proposedChainName: "Verdex Mainnet",
  networkSymbol: "VDX",
  networkDecimals: 18,
  consensus: "QBFT (Hyperledger Besu)",
  // Legacy testnet 7201 retired

  // ─── Miner Downloads (verified live links) ───────────────────────────────
  miners: {
    windows: {
      url: "/updates/Verdex-Miner-Setup-4.0.2.exe",
      version: "4.0.2",
      os: "Windows",
      label: "Windows",
      icon: "🪟",
    },
    android: {
      url: "/assets/downloads/Verdex-Android-1.10.5-build52.apk",
      version: "1.10.5",
      os: "Android",
      label: "Android APK",
      icon: "🤖",
    },
    linux: {
      url: null, // Redirects to dashboard — no direct download link
      version: "CLI",
      os: "Linux",
      label: "Linux CLI",
      icon: "🐧",
      note: "Available in dashboard",
    },
  },

  // ─── AMM / Swap (from swap.html — verified contract address) ─────────────
  amm: {
    contractShort: "0x01d2…b48e",
    contractFull: "0x01d23206724793af4d26104946094333282db48e",
    fee: {
      total: 0.25,
      lps: 0.17,
      treasury: 0.05,
      burn: 0.03,
    },
    formula: "x × y = k",
    tokens: ["WVDX", "USDT", "ALP"],
    status: "quotes_live_execution_pending", // wallet-signed swaps pending
  },

  // ─── VDX Tokenomics (from whitepaper v1.1) ──────────────────────────────
  vdx: {
    symbol: "VDX",
    totalSupply: 1_000_000_000,
    status: "pending_contract_deployment",
    allocation: [
      { label: "Liquidity Mining & Farms", pct: 40, color: "#24E596" },
      { label: "Treasury & Ecosystem", pct: 20, color: "#57FFB3" },
      { label: "Team & Advisors", pct: 15, color: "#22D3EE" },
      { label: "Community & Airdrops", pct: 15, color: "#3B82F6" },
      { label: "Private Sale", pct: 10, color: "#92AAA0" },
    ],
    stakingTiers: [
      { tier: "Seed", required: 1_000, discount: 10, boost: 1.1 },
      { tier: "Sprout", required: 10_000, discount: 25, boost: 1.5 },
      { tier: "Canopy", required: 100_000, discount: 50, boost: 2.0 },
      { tier: "Forest", required: 500_000, discount: 75, boost: 2.5 },
    ],
  },

  // ─── Social Links (verified from site) ──────────────────────────────────
  social: {
    tiktok: "https://www.tiktok.com/@blockchaindevolper",
    twitter: "https://x.com/VerdexSwap",
    discord: "https://discord.gg/verdex",
    telegram: "https://t.me/VerdixOffical",
    github: "https://github.com/verdexchainsuppourt-hue/verdex-ecosystem",
  },

  // ─── External links ──────────────────────────────────────────────────────
  links: {
    mainSite: "https://verdexswap.site",
    explorer: "https://verdexswap.site/explorer",
    whitepaper: "https://verdexswap.site/whitepaper.html",
    whitepaperPdf: "https://verdexswap.site/assets/verdex-whitepaper.pdf",
    devDocs: "https://verdexswap.site/verdex-developer-docs.html",
    apiNetwork: "https://verdexswap.site/api/network",
    rpc: "https://verdex-ecosystem-production.up.railway.app",
  },

  // ─── Roadmap (from whitepaper — honest statuses) ─────────────────────────
  roadmap: [
    {
      phase: "Phase 1",
      title: "Foundation",
      description:
        "Brand identity, website, whitepaper v1.0, community channels, and smart contract architecture design.",
      status: "completed" as const,
    },
    {
      phase: "Phase 2",
      title: "Mainnet Product Launch",
      description:
        "Desktop miners (Windows + Android), KYC/AML infrastructure, P2P APIs, block explorer, and DePIN mining system live.",
      status: "completed" as const,
    },
    {
      phase: "Phase 3",
      title: "Wallet Swaps & Liquidity UX",
      description:
        "Browser-signed swaps, add/remove liquidity UI, public LP onboarding, independent validator ceremony, audited VDX contracts.",
      status: "active" as const,
    },
    {
      phase: "Phase 4",
      title: "TGE · Full Mainnet & Expansion",
      description:
        "VDX token generation event, governance activation, multi-chain expansion, and advanced yield products.",
      status: "planned" as const,
    },
    {
      phase: "Phase 5",
      title: "Advanced Products",
      description:
        "Perpetuals, lending integration, institutional APIs, and cross-chain liquidity aggregation.",
      status: "research" as const,
    },
  ],
} as const;

// Supabase config (NEXT_PUBLIC_ prefix = safe for browser)
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Site URL
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://verdexswap.site";

// API proxy base (same-origin, never exposes Railway URL)
export const VERDEX_API_BASE =
  process.env.NEXT_PUBLIC_VERDEX_API_URL ?? "https://verdexswap.site/api";
