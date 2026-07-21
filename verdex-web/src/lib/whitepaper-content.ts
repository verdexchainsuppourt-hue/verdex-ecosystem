/**
 * Faithful condensation of the official Verdex Whitepaper v1.1 (July 2026).
 * Full document remains available as PDF — this renders the real sections
 * for the web reader. Do not add claims that are not in the source document.
 */
export interface WhitepaperSection {
  id: string;
  title: string;
  body: string[];
}

export const WHITEPAPER_META = {
  version: "v1.1",
  date: "July 2026",
  tag: "Pre-launch technical update",
};

export const WHITEPAPER: WhitepaperSection[] = [
  {
    id: "abstract",
    title: "Abstract",
    body: [
      "Verdex is a next-generation decentralized exchange (DEX) and DeFi ecosystem engineered to deliver institutional-grade liquidity infrastructure with consumer-grade simplicity. Inspired by the proven Automated Market Maker (AMM) models of Uniswap and PancakeSwap, Verdex introduces a vertically integrated suite of products — Swap, Pool, Farm, and Stake — governed by the VERDEX (VDX) token.",
      "This document presents the intended architecture, economic model, infrastructure stack, product logic, and strategic roadmap of Verdex. It is a pre-launch technical document, not a claim that a public mainnet, VDX contract, bridge, wallet transfer, P2P market, custody system, or KYC intake is live. The legacy testnet has been retired. Any public launch requires a signed genesis, independently controlled validators, verified contract deployments, independent audits, operational KYC/AML approval, and public release evidence.",
    ],
  },
  {
    id: "vision",
    title: "1. Vision & Mission",
    body: [
      "Our vision is to build the most accessible, efficient, and sustainable decentralized trading ecosystem in crypto. We believe that decentralized finance should not require a computer science degree to use, nor should it sacrifice user control for convenience.",
      "Mission: Empower every user to swap tokens, supply liquidity, and earn yields with complete custody of their assets, while benefiting from low fees, deep liquidity, and a protocol that rewards long-term participation.",
    ],
  },
  {
    id: "market-context",
    title: "2. Market Context",
    body: [
      "Decentralized exchanges have grown from experimental tools into the primary venue for on-chain asset exchange. However, several structural problems persist: user-experience friction, capital inefficiency in traditional AMMs, extractive short-term tokenomics, cross-chain fragmentation, and information asymmetry around impermanent loss, slippage, and fee mechanics.",
      "Verdex addresses each of these issues through careful product design, transparent economics, and an infrastructure roadmap built for interoperability.",
    ],
  },
  {
    id: "ecosystem",
    title: "3. The Verdex Ecosystem",
    body: [
      "The Verdex ecosystem maps how users, client interfaces, decentralized smart contracts, the proprietary Verdex blockchain, and external networks interlock into a seamless DeFi engine: Verdex Swap (the AMM front door with multi-hop routing), Verdex Pool (permissionless liquidity with proportional fee sharing), Verdex Farm (VDX reward distribution for LP tokens), and Verdex Stake (governance power, fee discounts, and farm boosts).",
      "Swap fee per trade totals 0.25%: 0.17% to liquidity providers, 0.05% to the protocol treasury, and 0.03% to VDX buyback & burn.",
    ],
  },
  {
    id: "tokenomics",
    title: "4. Tokenomics",
    body: [
      "The VERDEX token (ticker: VDX) is the protocol's native utility and governance asset, designed to capture value from trading activity while incentivizing participation across the ecosystem. Total fixed supply: 1,000,000,000 VDX.",
      "Distribution: Liquidity Mining & Farms 40% · Treasury & Ecosystem 20% · Team & Advisors 15% · Community & Airdrops 15% · Private Sale 10%.",
      "Utility: governance (fee structures, farm allocations, supported chains, treasury spending), fee reductions for stakers, farm yield boosts by tier, revenue capture via 0.03% buyback-and-burn on every swap, and launchpad access for staked holders.",
      "Emissions: the 400,000,000 VDX liquidity and farming allocation is proposed, but its emission curve is not final. Before contracts are deployed, governance and auditors must publish a capped, time-indexed distribution schedule whose total cannot exceed the allocation. No VDX is minted by consensus. Any Android reward programme is a separate, audited, Safe-funded claim distributor with a maximum of 25 VDX per KYC-approved account per UTC day and a global epoch budget.",
    ],
  },
  {
    id: "architecture",
    title: "5. Protocol Architecture & Infrastructure",
    body: [
      "Verdex Mainnet is a green Proof-of-Authority EVM chain (proposed chain ID 72010) deployed on Besu with QBFT consensus. Validators are independently controlled; the genesis must be signed and publicly verifiable before launch.",
      "The AMM layer follows the constant-product formula x × y = k with a router that evaluates direct pairs and multi-hop paths to return the best available output for a trade. Public access to the chain is served through bounded, same-origin RPC bridges — validator endpoints are never exposed to browsers.",
    ],
  },
  {
    id: "security",
    title: "6. Security & Risk Management",
    body: [
      "Security is the highest priority for Verdex. The protocol implements multiple layers of protection: third-party audits of all contracts by at least two independent security firms before mainnet launch; formal verification of critical invariants such as the constant-product formula and LP token math; a public bug-bounty program for responsible disclosure; multi-day timelocks on administrative actions; and a multi-signature treasury with hardware-backed keys.",
    ],
  },
  {
    id: "governance",
    title: "7. Governance",
    body: [
      "Verdex will progressively decentralize into a community-governed DAO. VDX stakers propose and vote on protocol changes covering fee-tier adjustments, farm allocation points, new chain deployments, treasury spending and grants, and contract upgrades or parameter changes.",
      "Proposals require a minimum quorum of participating staked VDX and a majority vote to pass. Passed proposals are queued in a timelock before execution.",
    ],
  },
  {
    id: "roadmap",
    title: "8. Roadmap",
    body: [
      "Phase 1 — Brand identity, website, whitepaper, and community channels: Completed.",
      "Phase 2 — Legacy testnet retired; Windows Besu QBFT deployment tooling and pre-launch operational documentation: In progress.",
      "Phase 3 — Independent validator ceremony, signed genesis, audited VDX/escrow contracts, Safe custody, KYC/AML operations, and public verification evidence: Required before launch.",
      "Phase 4 — Mainnet launch, governance activation, and public services only after Phase 3 evidence is complete: Not launched.",
      "Phase 5 — Advanced products: perpetuals, lending integration, institutional APIs: Future.",
    ],
  },
  {
    id: "conclusion",
    title: "9. Conclusion",
    body: [
      "Verdex combines a proven AMM model with sustainable tokenomics, a green PoA chain, and a product suite designed for both traders and long-term liquidity providers. The protocol's success is measured not by launch-day hype, but by verifiable security, transparent economics, and steady, community-governed growth.",
    ],
  },
];
