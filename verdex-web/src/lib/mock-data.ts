/**
 * Demo placeholder data for UI states that have no public production endpoint yet.
 * Everything here is clearly labeled as demo and is swapped for live API data
 * (TanStack Query hooks in lib/api.ts) wherever a real endpoint exists.
 */
import type {
  ChartPoint, FaqItem, Pool, RewardEntry, RoadmapItem, TokenomicsSlice,
  TxRecord, VestingItem, Worker,
} from "./types";

/* ---------- deterministic series (SSR-stable) ---------- */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function series(days: number, start: number, drift: number, vol: number, seed: number): ChartPoint[] {
  const rnd = mulberry32(seed);
  const out: ChartPoint[] = [];
  let v = start;
  const now = new Date("2026-07-19T00:00:00Z").getTime();
  for (let i = days; i >= 0; i--) {
    v = Math.max(v * (1 + drift + (rnd() - 0.5) * vol), start * 0.35);
    const d = new Date(now - i * 86_400_000);
    out.push({ date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: Math.round(v * 100) / 100 });
  }
  return out;
}

export const HASHRATE_SERIES = series(30, 14200, 0.002, 0.3, 11);
export const VP_EARNINGS_SERIES = series(30, 320, 0.004, 0.45, 23);
export const TVL_SERIES = series(90, 1_840_000, 0.004, 0.06, 37);
export const VOLUME_SERIES = series(90, 96_000, 0.004, 0.4, 51);

/* ---------- pools (demo values; live pools on-chain are WVDX/USDT/ALP) ---------- */
export const POOLS: Pool[] = [
  { id: "p1", tokenA: "WVDX", tokenB: "USDT", network: "verdex", type: "AMM", tvl: 842_000, volume24h: 124_000, fees24h: 310, apy: 24.6, feeTier: 0.25, risk: "Medium" },
  { id: "p2", tokenA: "WVDX", tokenB: "ALP", network: "verdex", type: "AMM", tvl: 387_000, volume24h: 64_200, fees24h: 161, apy: 31.4, feeTier: 0.3, risk: "High" },
  { id: "p3", tokenA: "USDT", tokenB: "ALP", network: "verdex", type: "AMM", tvl: 456_000, volume24h: 81_200, fees24h: 203, apy: 21.3, feeTier: 0.25, risk: "Medium" },
];

/* ---------- mining (demo; replaced by /api/mining/status when signed in) ---------- */
export const WORKERS: Worker[] = [
  { id: "w1", name: "windows-rig-01", device: "Windows · GUI", version: "v4.0.2", status: "online", hashRate: 14850, lastShare: "12s ago", uptime: "6h 42m", vpToday: 412.6 },
  { id: "w2", name: "android-pixel", device: "Android · APK", version: "v1.9.5", status: "online", hashRate: 3120, lastShare: "48s ago", uptime: "2h 05m", vpToday: 96.2 },
  { id: "w3", name: "linux-node", device: "Linux · CLI", version: "v4.0.2", status: "offline", hashRate: 0, lastShare: "3h ago", uptime: "—", vpToday: 0 },
];

export const REWARDS: RewardEntry[] = [
  { id: "r1", date: "Jul 19, 2026", source: "Mining", amountVp: 412.6, amountVdx: 0, status: "pending" },
  { id: "r2", date: "Jul 18, 2026", source: "Mining", amountVp: 1024.4, amountVdx: 10.24, status: "credited" },
  { id: "r3", date: "Jul 18, 2026", source: "Referral", amountVp: 150, amountVdx: 1.5, status: "credited" },
  { id: "r4", date: "Jul 17, 2026", source: "LP Fees", amountVp: 0, amountVdx: 4.82, status: "claimable" },
  { id: "r5", date: "Jul 17, 2026", source: "Mining", amountVp: 986.1, amountVdx: 9.86, status: "credited" },
];

export const TRANSACTIONS: TxRecord[] = [
  { id: "t1", type: "Mining", summary: "VP credited · daily session", value: 10.24, time: "2 hrs ago", status: "confirmed", hash: "0x8f3a91c2d4e5b6a78901f2c3d4e5b6a78901f2c3d4e5b6a78901f2c3d4e5b6a7" },
  { id: "t2", type: "Swap", summary: "120 USDT → 285.4 VDX", value: 120, time: "5 hrs ago", status: "confirmed", hash: "0x1b2c3d4e5f6a7890b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4" },
  { id: "t3", type: "Add", summary: "WVDX + USDT liquidity", value: 2400, time: "Yesterday", status: "confirmed", hash: "0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899" },
  { id: "t4", type: "Send", summary: "84.2 VDX → 0x71C…9F3", value: 35.4, time: "Yesterday", status: "pending", hash: "0xff0011ee22dd33cc44bb55aa66998877ff0011ee22dd33cc44bb55aa66998877" },
  { id: "t5", type: "Claim", summary: "Payout · VP → VDX", value: 96.1, time: "2 days ago", status: "failed", hash: "0x99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa" },
];

/* ---------- tokenomics (whitepaper v1.1 — real) ---------- */
export const TOKENOMICS: TokenomicsSlice[] = [
  { label: "Liquidity Mining & Farms", pct: 40, color: "#24E596" },
  { label: "Treasury & Ecosystem", pct: 20, color: "#22D3EE" },
  { label: "Team & Advisors", pct: 15, color: "#3B82F6" },
  { label: "Community & Airdrops", pct: 15, color: "#57FFB3" },
  { label: "Private Sale", pct: 10, color: "#F5B942" },
];

export const VESTING: VestingItem[] = [
  { group: "Liquidity Mining & Farms", allocation: "400,000,000 VDX", schedule: "Weekly emissions starting at 5M VDX, decaying 10% each quarter" },
  { group: "Treasury & Ecosystem", allocation: "200,000,000 VDX", schedule: "Governance-controlled treasury release" },
  { group: "Team & Advisors", allocation: "150,000,000 VDX", schedule: "Long-term vesting (details in whitepaper)" },
  { group: "Community & Airdrops", allocation: "150,000,000 VDX", schedule: "Community programs over multiple seasons" },
  { group: "Private Sale", allocation: "100,000,000 VDX", schedule: "Vested sale allocation (details in whitepaper)" },
];

/* ---------- roadmap (matches current site phases; no invented dates) ---------- */
export const ROADMAP: RoadmapItem[] = [
  { phase: "Phase 1", title: "Foundation", description: "Brand creation, website launch, whitepaper release, community building, and smart-contract architecture design.", status: "completed" },
  { phase: "Phase 2", title: "Mainnet Product Launch", description: "Website, miners, KYC/AML, P2P APIs, and explorer live. Proposed Besu chain ID 72010; on-chain VDX after validator + contract verification.", status: "completed" },
  { phase: "Phase 3", title: "Wallet Swaps & Liquidity UX", description: "Browser-signed swaps, add/remove liquidity UI, public LP onboarding, and deeper pool liquidity before TGE.", status: "in-development" },
  { phase: "Phase 4", title: "TGE · Mainnet & Expansion", description: "VDX token generation, full mainnet hardening, multi-chain expansion, governance, and advanced yield products.", status: "planned" },
];

/* ---------- FAQ (real product answers) ---------- */
export const FAQS: FaqItem[] = [
  { question: "What is Verdex?", answer: "Verdex is a green Proof-of-Authority EVM Layer-1 ecosystem combining a decentralized exchange (Verdex Swap), liquidity pools, and a DePIN mining network where users earn Verdex Points (VP) that convert to VDX — all self-custodial." },
  { question: "Is Verdex a decentralized exchange?", answer: "Yes. Verdex Swap is a constant-product AMM (x × y = k) with multi-hop routing across WVDX, USDT, and ALP pools. Trades execute on-chain through verifiable contracts — Verdex never holds your funds." },
  { question: "How does swap routing work?", answer: "The aggregator calls the on-chain router's findBestRoute for your pair and amount, compares direct and multi-hop paths, and returns the route with the highest expected output. When a route is found you'll see “Optimized route found” with each hop listed." },
  { question: "Does Verdex hold user funds?", answer: "No. Swaps and liquidity positions are non-custodial smart-contract interactions. Account balances for mining (VP) are tracked off-chain and paid out on-chain at claim finality." },
  { question: "How do liquidity pools work?", answer: "Deposit equal values of two tokens into a pool to mint LP tokens. Every swap in that pool pays 0.17% of the 0.25% fee to liquidity providers, compounding into the pool automatically." },
  { question: "Are yields guaranteed?", answer: "No. LP fee income and mining rewards vary with volume, participation, and emissions. Nothing on Verdex is a guaranteed return." },
  { question: "What is VDX?", answer: "VDX is the native asset of Verdex Mainnet (proposed chain ID 72010). It is used for gas, LP pairs, and ecosystem rewards. Total supply is 1,000,000,000 VDX per whitepaper v1.1." },
  { question: "How does VDX mining work?", answer: "Create an account, download the Verdex miner (Windows GUI, Android APK, or Linux CLI), authenticate it with an API token from your dashboard, and keep it online. Valid heartbeats earn VP; VP converts to VDX at payout finality." },
  { question: "Where can I download the Verdex CLI miner?", answer: "Only from the official domain: verdexswap.site (Downloads page or your dashboard). Never install a miner from third-party links." },
  { question: "How can I verify the miner download?", answer: "Check the published SHA-256 checksum on the downloads page and confirm the file came from https://verdexswap.site before running it." },
  { question: "Does Verdex require a seed phrase?", answer: "Verdex will never ask for your seed phrase or private key. The in-dashboard wallet generates secrets locally in your browser; account sign-in uses email or Google OAuth." },
  { question: "How do I view my rewards?", answer: "Open Dashboard → Rewards for VP balances, pending payouts, and credit history, or Dashboard → Mining for live worker stats." },
  { question: "Which networks are supported?", answer: "Verdex Mainnet (proposed chain ID 72010) is the live network. Additional EVM networks are announced on the roadmap as they become available." },
  { question: "Where can I read the whitepaper?", answer: "The Whitepaper page hosts the full v1.1 document online, and a PDF is linked there as well." },
];

/* ---------- demo platform snapshot (labeled) ---------- */
export const DEMO_SNAPSHOT = {
  vpBalance: 12_482.6,
  vdxBalance: 148.32,
  miningStatus: "online" as const,
  hashRate: 17_970,
  avgHashRate: 15_400,
  totalMined: 3_208.5,
  pendingRewards: 412.6,
  availableRewards: 148.32,
  activeMiners: 2,
  streak: 9,
  longestStreak: 21,
  rank: 342,
  uptimeToday: "6h 42m",
};
