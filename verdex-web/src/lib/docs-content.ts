/** Documentation information architecture + starter content (real product topics). */
export interface DocPage {
  slug: string;
  title: string;
  body: string[];
  code?: { lang: string; content: string };
}

export interface DocCategory {
  category: string;
  pages: DocPage[];
}

export const DOCS: DocCategory[] = [
  {
    category: "Getting Started",
    pages: [
      {
        slug: "introduction",
        title: "Introduction",
        body: [
          "Verdex is a green Proof-of-Authority EVM Layer-1 ecosystem: a decentralized exchange (Verdex Swap), liquidity pools, and a DePIN mining network, unified under one account and one dashboard.",
          "Everything is self-custodial: swaps and liquidity are smart-contract interactions, and the mining account layer pays out on-chain. Verdex never holds your keys.",
        ],
      },
      {
        slug: "ecosystem",
        title: "The Verdex Ecosystem",
        body: [
          "Swap routes trades through the AMM aggregator. Pools let anyone provide liquidity and earn 0.17% of every trade. Farms distribute VDX emissions to LP tokens. Mining lets CPU/GPU owners contribute to the DePIN pool and earn Verdex Points (VP) convertible to VDX at payout finality.",
        ],
      },
      {
        slug: "create-account",
        title: "Create an Account",
        body: [
          "Accounts power mining, rewards, referrals, and device management. Register with email + password or Google OAuth, then confirm the verification code sent to your inbox.",
          "Verdex will never ask for your seed phrase or private key during sign-up.",
        ],
      },
    ],
  },
  {
    category: "Exchange",
    pages: [
      {
        slug: "swap",
        title: "Decentralized Exchange",
        body: [
          "Verdex Swap is a constant-product AMM (x × y = k). Live pools today: WVDX / USDT / ALP on Verdex Mainnet. The total fee per trade is 0.25% — 0.17% to LPs, 0.05% to treasury, 0.03% to VDX buyback & burn.",
        ],
      },
      {
        slug: "routing",
        title: "Swap Routing",
        body: [
          "For every quote, the router calls the on-chain findBestRoute for your pair and amount, comparing direct and multi-hop paths. The UI shows the selected path, expected output, price impact, and fee before you confirm.",
        ],
      },
      {
        slug: "liquidity-pools",
        title: "Liquidity Pools",
        body: [
          "Deposit equal values of both tokens to mint LP tokens representing your pool share. LP fees accrue into the pool automatically. Yields are variable and depend on volume and TVL.",
        ],
      },
      {
        slug: "yield",
        title: "Yield Mechanics",
        body: [
          "Fee yield comes from trading activity. Farm yield comes from VDX emissions allocated to each pool. Emissions decay quarterly for sustainability. Nothing is guaranteed.",
        ],
      },
    ],
  },
  {
    category: "VDX & Mining",
    pages: [
      {
        slug: "vdx-token",
        title: "VDX Token",
        body: [
          "VDX is the native asset of Verdex Mainnet (proposed chain ID 72010): gas, LP pairs, governance, fee discounts, and farm boosts. Fixed supply 1,000,000,000 VDX — see Whitepaper v1.1 for distribution and the final emission schedule, which governance and auditors publish before contracts deploy.",
        ],
      },
      {
        slug: "mining",
        title: "How Mining Works",
        body: [
          "The Verdex DePIN pool credits valid heartbeats from authenticated miners as Verdex Points (VP). VP converts to VDX at payout finality. Rewards depend on uptime and valid work — they are not fixed or guaranteed.",
        ],
      },
      {
        slug: "cli-install",
        title: "CLI Miner Installation",
        body: [
          "Download the miner only from verdexswap.site. Windows: run the Setup EXE (auto-updates on launch). Android: install the APK. Linux CLI: download from your dashboard, then authenticate with an API token.",
        ],
        code: {
          lang: "bash",
          content: "# 1) Create an API token in Dashboard → Downloads\n# 2) Authenticate the CLI miner (token shown once at creation)\nverdex-miner auth --token vdx_live_xxxxxxxxxxxxxxxx\n\n# 3) Start mining\nverdex-miner start --worker linux-node\n\n# 4) Check status\nverdex-miner status",
        },
      },
      {
        slug: "mining-rewards",
        title: "Rewards & Payouts",
        body: [
          "Track VP in Dashboard → Rewards. Request payout from Dashboard → Mining when eligible; VP converts to VDX at claim finality per protocol rules. KYC-approved Android accounts are capped at 25 VDX per UTC day under the audited claim distributor.",
        ],
      },
    ],
  },
  {
    category: "Wallet & Security",
    pages: [
      {
        slug: "wallet",
        title: "Wallet",
        body: [
          "The dashboard wallet is an EVM wallet generated locally in your browser (create or import via mnemonic/private key). Secrets never leave your device unencrypted. You can also connect MetaMask to Verdex Mainnet via the network selector.",
        ],
      },
      {
        slug: "security",
        title: "Security",
        body: [
          "Verify you are on https://verdexswap.site before signing in or downloading software. Check SHA-256 checksums before running the miner. Verdex staff will never ask for your seed phrase, private key, or password.",
        ],
      },
      {
        slug: "risks",
        title: "Risks",
        body: [
          "DeFi involves risk: smart-contract risk, market risk, impermanent loss for LPs, and variable mining rewards. The protocol is pre-mainnet-launch software — only use funds you can afford to lose. Nothing on Verdex is financial advice.",
        ],
      },
    ],
  },
  {
    category: "Developers",
    pages: [
      {
        slug: "api",
        title: "API Overview",
        body: [
          "Public endpoints: GET /api/network (mainnet config), /api/chain + /api/rpc (bounded chain bridges), /api/explorer. Authenticated endpoints: /api/auth, /api/mining, /api/kyc, /api/p2p. See the full developer reference for schemas.",
        ],
        code: {
          lang: "bash",
          content: "curl -s https://verdexswap.site/api/network | jq .network.chainId\n# 72010",
        },
      },
    ],
  },
];
