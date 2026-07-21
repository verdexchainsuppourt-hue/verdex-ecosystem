# Verdex — Current Product Analysis (from production source)

> Compiled by inspecting the live codebase at `verdexswap.site` (static frontend +
> Vercel serverless API + Supabase backend). This document is the ground truth the
> Next.js redesign is built against. Nothing in the redesign invents features
> beyond what is listed here.

## 1. Product essence

Verdex is a green PoA EVM Layer-1 ecosystem ("Swap Smart. Grow Green.") with four
real product pillars:

1. **Verdex Swap** — AMM swap UI with live on-chain quotes (`findBestRoute` via a
   bounded `/api/rpc` JSON-RPC bridge). Pools: WVDX / USDT / ALP. Fee 0.25%
   (0.17% LP · 0.05% treasury · 0.03% buyback-burn). Wallet-signed swaps are the
   published next step.
2. **VDX Mining (DePIN)** — account-based mining: Windows GUI miner (v4.0.2),
   Android APK (v1.9.5), Linux CLI, browser mining. Heartbeats earn Verdex Points
   (VP); payout converts VP → VDX at claim finality. API-token authenticated CLI.
3. **User platform** — Supabase auth (email+password, Google OAuth, email
   verification code), VP balance, streaks, rank, leaderboard, referrals,
   API-token device management, KYC status, P2P flag.
4. **Wallet** — in-dashboard EVM wallet (create/import mnemonic or private key),
   VDX on-chain balance, send panel (custom tokens, address book, gas
   standard/fast/custom), receive panel with QR, tx receipt with explorer link.

Supporting surfaces: block explorer, whitepaper v1.1, developer docs, FAQ,
mainnet status page, KYC moderation, admin panel, P2P marketplace (KYC-gated),
desktop Electron miner app.

## 2. Existing pages (production)

| Route | File | Purpose |
|---|---|---|
| `/` | index.html | Marketing landing |
| `/swap` | swap.html | AMM swap quotes |
| `/dashboard` | dashboard.html | Auth + mining + wallet hub |
| `/explorer` | explorer/index.html | Block explorer |
| `/whitepaper` | whitepaper.html | Whitepaper v1.1 |
| `/docs`, `/developer-docs` | verdex-developer-docs.html | Dev docs |
| `/faq` | faq.html | FAQ |
| `/mainnet` | mainnet.html | Network status |
| `/p2p` | p2p.html | P2P marketplace |
| `/kyc-moderation` | kyc-moderation.html | KYC ops |
| `/admin` | admin.html | Admin |
| faucet, add-network | redirects → /mainnet | Retired |

## 3. API surface (serverless, production)

- `GET /api/network` — public mainnet config (chainId 72010 proposed, RPC bridge, contracts, explorer)
- `/api/chain`, `/api/rpc` — bounded chain REST / JSON-RPC bridges
- `/api/auth?action=send-code|verify-code|session|send-welcome`
- `/api/mining?action=status|heartbeat|leaderboard|payout|pool-status|token|token-create|web-mine|challenge|download`
- `/api/kyc?action=me|config|submit|uploads|cases|…`
- `/api/p2p?…` — KYC-gated P2P coordination
- `/api/explorer`, `/api/waitlist`, `/api/wallet`, `/api/admin`, `/api/cron/*`

Supabase tables used by the client: profiles, wallets, point_transactions,
mining_sessions, heartbeats, api_tokens, mining_config (+ KYC tables).

## 4. Verified facts used in the redesign

- Chain: proposed mainnet chain ID **72010** (Besu QBFT PoA); testnet 7201 retired; public faucet permanently retired.
- Swap fee: 0.25% total = 0.17% LP + 0.05% treasury + 0.03% VDX buyback & burn.
- Tokenomics (whitepaper v1.1): 1,000,000,000 VDX — 40% liquidity mining & farms, 20% treasury & ecosystem, 15% team & advisors, 15% community & airdrops, 10% private sale. Farm emissions start 5M VDX/week, −10% quarterly.
- Miner downloads: `updates/Verdex-Miner-Setup-4.0.2.exe`, `assets/downloads/Verdex-Android-1.9.5-build42.apk`; Linux CLI from dashboard; apps auto-update.
- Socials: TikTok @blockchaindevolper · X @VerdexSwap · Discord discord.gg/verdex · Telegram t.me/VerdixOffical · GitHub verdexchainsuppourt-hue/verdex-ecosystem.
- Wallet connector: EIP-1193 via `wallet_addEthereumChain` (js/network-config.js `addVerdexToWallet`).

## 5. UI/UX problems in the current product

1. **Fragmented IA** — swap, dashboard, wallet, mining, downloads all live inside one monolithic 161KB dashboard.html; discoverability is poor.
2. **Inconsistent design language** — every page ships its own inline theme (3+ different greens, different radii/typography scales).
3. **No shared component system** — duplicated navbars, buttons, cards; no skeleton/empty/error-state consistency.
4. **Auth friction** — sign-in and dashboard compete in one document; verification screen is easy to miss.
5. **Weak mobile patterns** — no bottom nav in the app area, wide tables overflow.
6. **States are ad-hoc** — loading = full-screen overlay; few empty/offline/error surfaces; no skeletons.
7. **Jargon without guidance** — VP vs VDX, "claim finality", KYC tiers lack inline explanations/tooltips.
8. **Accessibility** — limited focus states, aria labels, reduced-motion support.

## 6. Redesign information architecture

**Public (marketing layout)** — Home · Swap · Liquidity (+Add) · Earn · Mining ·
VDX · Ecosystem · Whitepaper · Docs · Security · Roadmap

**Auth layout** — Sign In · Create Account (+ email verification step)

**Platform layout (sidebar shell)** — Dashboard · Wallet · Mining Dashboard ·
Miner Downloads · Mining Activity · Rewards · Transactions · Account Settings

Design system: near-black `#020706`, section `#06100D`, elevated `#0A1713`,
glass `rgba(10,25,21,.72)`, emerald `#24E596` / bright `#57FFB3`, cyan `#22D3EE`,
blue `#3B82F6`, ink `#F4FFF9`, muted `#92AAA0`, border `rgba(87,255,179,.14)`,
error `#FF5C6C`, warning `#F5B942`. Space Grotesk headings, Inter body,
JetBrains Mono for hashes/stats. Framer Motion reveals, R3F lazy 3D crystal of
the real Verdex emblem, Recharts, shadcn-style primitives, Supabase auth,
TanStack Query data layer, RHF + Zod forms.
