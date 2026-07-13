<div align="center">
  <img src="assets/verdex-token.png" alt="Verdex Logo" width="150" />
  
  # Verdex Ecosystem (PRC20 Protocol)
  
  **Swap Smart. Grow Green.**
  
  [![Website](https://img.shields.io/badge/Website-verdexswap.site-22c55e?style=for-the-badge)](https://verdexswap.site)
  [![Testnet](https://img.shields.io/badge/Testnet-Live-4ade80?style=for-the-badge)](https://verdexswap.site)
  [![Chain ID](https://img.shields.io/badge/Chain_ID-7201-16a34a?style=for-the-badge)]()
  [![Standard](https://img.shields.io/badge/Standard-PRC20-86efac?style=for-the-badge)]()
  [![Whitepaper](https://img.shields.io/badge/Whitepaper-Read_Online-9333ea?style=for-the-badge)](https://verdexswap.site/whitepaper.html)
  
</div>

---

## 🌍 What is Verdex?

Verdex is a next-generation, fully decentralized exchange (DEX) and complete DeFi ecosystem built on the proprietary **PRC20 standard**. Designed to rival the BNB Smart Chain (BSC) and Ethereum, the network is hyper-optimized for speed, extremely low fees, and environmental sustainability.

At its core, Verdex is:
- 🔗 A **custom Layer-1 Proof-of-Authority blockchain** (Chain ID: 7201)
- ⚙️ A **complete PRC20 token standard** (like BEP20 for BNB, but for Verdex)
- 🔄 A **decentralized AMM exchange** (Swap, Pool, Farm, Stake)
- 🖥️ A **Desktop Mining Network** (DePIN) where anyone can earn Verdex Points (VP)
- 🌉 A **cross-chain bridge** designed to interoperate with the BNB Smart Chain

---

## 🗺️ Full Ecosystem Architecture

```mermaid
graph TD
    classDef user fill:#0a0a0a,stroke:#00ff88,stroke-width:2px,color:#fff
    classDef frontend fill:#1a2b1f,stroke:#22c55e,stroke-width:2px,color:#fff
    classDef contract fill:#053f1f,stroke:#4ade80,stroke-width:2px,color:#fff
    classDef network fill:#001100,stroke:#86efac,stroke-width:3px,color:#fff
    classDef ext fill:#1e1e1e,stroke:#f3ba2f,stroke-width:2px,color:#fff

    subgraph Users ["👥 Ecosystem Participants"]
        T(Traders):::user
        LP(Liquidity Providers):::user
        M(Node Miners):::user
    end

    subgraph Interfaces ["💻 Client Interfaces"]
        W[Web Swap UI & Dashboard]:::frontend
        App[Verdex Desktop Miner]:::frontend
    end

    subgraph CoreContracts ["⚙️ PRC20 Smart Contracts"]
        Router[Verdex Router]:::contract
        Pools[Liquidity Pools]:::contract
        Farm[Yield Farms]:::contract
        Stake[Staking Vaults]:::contract
        Treasury[Protocol Treasury]:::contract
    end

    subgraph Network ["🌐 Verdex L1 Blockchain (Chain ID 7201)"]
        Mempool[(Transaction Mempool)]:::network
        Consensus{PoA Consensus Engine}:::network
        Burn[Dead Address / Burn 🔥]:::network
        Bridge[Cross-Chain Bridge Node]:::network
    end

    BSC(((BNB Smart Chain))):::ext

    T -->|Executes Swaps| W
    LP -->|Supplies Assets| W
    M -->|Runs Validation| App

    W -->|Routes Trades| Router
    Router -->|Queries Liquidity| Pools
    Pools -->|Swap Fees| Treasury
    Pools -->|LP Tokens| LP
    LP -->|Stakes LP| Farm
    Farm -->|Emits VDX| LP
    T -->|Stakes VDX| Stake
    Stake -->|Fee Discounts & Governance| T

    App -->|Pulls Transactions| Mempool
    Mempool -->|Batching| Consensus
    Consensus -->|Validates Blocks| Pools
    Consensus -->|Base Fee| Burn
    Consensus -->|Block Reward VP| App

    Bridge <-->|Lock & Mint Protocol| BSC
    Bridge <-->|Cross-Chain Liquidity| Pools
```

---

## 🔄 How a Swap Works (Transaction Lifecycle)

```mermaid
graph TD
    classDef startStop fill:#9333ea,stroke:#c084fc,color:#fff
    classDef process fill:#1a3a2a,stroke:#22c55e,color:#fff
    classDef decision fill:#0f2d1a,stroke:#4ade80,color:#fff
    classDef io fill:#7e22ce,stroke:#c084fc,color:#fff

    A([User Initiates Swap]):::startStop --> B[/Input Token A → Token B/]:::io
    B --> C[Router queries all Pools]:::process
    C --> D{Direct Pool exists?}:::decision
    D -- Yes --> E[Direct Route]:::process
    D -- No --> F[Multi-Hop Route: A→C→B]:::process
    E --> G{Slippage OK?}:::decision
    F --> G
    G -- No --> H[/Error: Slippage Too High/]:::io --> Z1([Stop]):::startStop
    G -- Yes --> I[Deduct 0.25% Fee]:::process
    I --> J[Execute Atomic Swap]:::process
    J --> K[/Token B → User Wallet/]:::io
    K --> L[0.17% to LP / 0.05% Treasury / 0.03% Burn]:::process
    L --> Z2([Complete ✅]):::startStop
```

---

## 💧 How Liquidity & Farming Works

```mermaid
graph LR
    classDef user fill:#9333ea,stroke:#c084fc,color:#fff
    classDef pool fill:#1a3a2a,stroke:#22c55e,color:#fff
    classDef reward fill:#0f2d1a,stroke:#4ade80,color:#fff
    classDef burn fill:#3f0000,stroke:#ff4444,color:#fff

    User([LP User]):::user -->|Deposits Token A + B| Pool[(Liquidity Pool)]:::pool
    Pool -->|Mints LP Tokens| User
    Trader([Trader]):::user -->|Swaps tokens| Pool
    Pool -->|0.17% Fee| Reward[LP Fee Rewards]:::reward
    Pool -->|0.05% Fee| Treasury[Protocol Treasury]:::reward
    Pool -->|0.03% Fee| Burn[VDX Burn 🔥]:::burn
    User -->|Stakes LP Token| Farm[Yield Farm]:::reward
    Farm -->|Emits VDX| User
```

---

## ⛏️ How Desktop Mining (DePIN) Works

```mermaid
graph LR
    classDef node fill:#1a1a1a,stroke:#00ff88,stroke-width:2px,color:#fff
    classDef chain fill:#003311,stroke:#00ff88,stroke-width:2px,color:#fff

    Tx[User Transactions]:::node --> |Broadcast to| Mempool[(Mempool)]:::chain
    Mempool --> MN[Miner Node 1]:::node
    Mempool --> MN2[Miner Node 2]:::node
    MN --> |PoA Consensus| Block[New Block]:::chain
    MN2 --> |PoA Consensus| Block
    Block --> |EIP-1559 Base Fee| Burn[(🔥 Dead Address)]:::node
    Block --> |Block Reward| VP[VP Points → Miner]:::node
```

---

## 🌉 BNB Smart Chain Cross-Chain Bridge

```mermaid
sequenceDiagram
    participant User as 👛 User Wallet
    participant BNB as BNB Smart Chain (BSC)
    participant Bridge as Verdex Bridge Node
    participant PRC20 as Verdex PRC20 Network

    User->>BNB: Deposit USDT to Bridge Contract
    BNB-->>Bridge: Emit 'Lock' Event
    Bridge->>Bridge: Multi-sig Consensus Validation
    Bridge->>PRC20: Mint PRC20-USDT
    PRC20-->>User: Receive PRC20-USDT ✅
```

---

## 🏛️ Smart Contract Architecture

```mermaid
graph TD
    classDef ui fill:#1a2b1f,stroke:#22c55e,color:#fff
    classDef core fill:#053f1f,stroke:#4ade80,color:#fff
    classDef gov fill:#2a1a4a,stroke:#c084fc,color:#fff

    subgraph UI ["💻 User Layer"]
        WebUI[Web Swap UI]:::ui
        Miner[Desktop Miner]:::ui
    end
    subgraph Contracts ["⚙️ Smart Contracts"]
        Router[VerdexRouter]:::core
        Factory[VerdexFactory]:::core
        Pair[VerdexPair]:::core
        Farm[FarmMaster]:::core
        Vault[StakingVault]:::core
    end
    subgraph Gov ["🏛️ Governance"]
        GovContract[Governance DAO]:::gov
        Treasury[Multi-Sig Treasury]:::gov
    end

    WebUI --> Router --> Factory --> Pair --> Farm --> Vault --> GovContract --> Treasury
    Miner --> Pair
```

---

## 📊 VDX Token Distribution

```mermaid
pie title VDX Token Distribution (1,000,000,000 VDX)
    "Liquidity Mining & Farms (40%)" : 40
    "Treasury & Ecosystem (20%)" : 20
    "Team & Advisors (15%)" : 15
    "Community & Airdrops (15%)" : 15
    "Private Sale (10%)" : 10
```

---

## 🗓️ Roadmap

| Phase | Milestone | Status |
|-------|-----------|--------|
| ✅ Phase 1 | Brand, website, whitepaper, community channels | **Completed** |
| 🔄 Phase 2 | PRC20 Testnet (Chain ID 7201), Desktop Miner, VP Mining, Explorer | **In Progress** |
| 📅 Phase 3 | VDX Token Generation Event, Exchange Listings — **Dec 12, 2026** | Upcoming |
| 🚀 Phase 4 | Mainnet launch, DAO governance, multi-chain expansion | Upcoming |
| 🌐 Phase 5 | Perpetuals, lending, institutional APIs | Future |

---

## 🌐 Official Links

| Resource | Link |
|----------|------|
| 🌍 Website | [verdexswap.site](https://verdexswap.site) |
| 📄 Whitepaper (Read Online) | [verdexswap.site/whitepaper.html](https://verdexswap.site/whitepaper.html) |
| ⛏️ Mining Dashboard | [verdexswap.site/dashboard.html](https://verdexswap.site/dashboard.html) |
| 📬 Contact | verdexchainsuppourt@gmail.com |
| 💬 Telegram | [@VerdixOffical](https://t.me/VerdixOffical) |
| 🎵 TikTok | [@blockchaindevolper](https://tiktok.com/@blockchaindevolper) |

---

<div align="center">
  <b>Building the greenest, fastest DeFi ecosystem in Web3.</b><br/>
  <i>Developed by Suleman — Other contributors to be announced.</i>
</div>
