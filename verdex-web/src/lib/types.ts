export type RiskLevel = "Low" | "Medium" | "High";
export type TxStatus = "pending" | "confirmed" | "failed";
export type RoadmapStatus = "completed" | "in-development" | "planned" | "research";
export type MiningStatus = "online" | "offline" | "syncing";

export interface Network {
  id: string;
  name: string;
  shortName: string;
  chainId: number;
  color: string;
  isDefault?: boolean;
  /** true when the network is announced but not yet live for swaps */
  upcoming?: boolean;
}

export interface Token {
  symbol: string;
  name: string;
  decimals: number;
  color: string;
  price: number; // demo USD reference price
  isStable?: boolean;
}

export interface Pool {
  id: string;
  tokenA: string;
  tokenB: string;
  network: string;
  type: "AMM" | "Stable";
  tvl: number;
  volume24h: number;
  fees24h: number;
  apy: number;
  feeTier: number;
  risk: RiskLevel;
}

export interface TxRecord {
  id: string;
  type: "Swap" | "Add" | "Remove" | "Claim" | "Mining" | "Send" | "Receive";
  summary: string;
  value: number;
  time: string;
  status: TxStatus;
  hash: string;
}

export interface ChartPoint {
  date: string;
  value: number;
  value2?: number;
}

export interface RoadmapItem {
  phase: string;
  title: string;
  description: string;
  status: RoadmapStatus;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface Worker {
  id: string;
  name: string;
  device: string;
  version: string;
  status: MiningStatus;
  hashRate: number; // H/s
  lastShare: string;
  uptime: string;
  vpToday: number;
}

export interface RewardEntry {
  id: string;
  date: string;
  source: "Mining" | "LP Fees" | "Referral" | "Bonus";
  amountVp: number;
  amountVdx: number;
  status: "credited" | "pending" | "claimable";
}

export interface VestingItem {
  group: string;
  allocation: string;
  schedule: string;
}

export interface TokenomicsSlice {
  label: string;
  pct: number;
  color: string;
}

export interface DownloadInfo {
  os: string;
  version: string;
  date: string;
  size: string;
  file: string;
  sha256: string;
  notes: string[];
}
