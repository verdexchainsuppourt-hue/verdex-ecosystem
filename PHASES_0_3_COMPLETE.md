# Verdex Implementation — Phases 0–4

**Phase 4 AMM is LIVE on Railway Verdex L1 (JS-VM) and production site.**

| Item | Value |
|------|--------|
| VerdexAMM | `0x01d23206724793af4d26104946094333282db48e` |
| Deploy tx | `0xc39dd7daad2eddc4bd85c341f0bab2a83a2b8d3634cbcabadd6b44c5e56e7c3f` |
| RPC | https://verdex-ecosystem-production.up.railway.app |
| Pools | WVDX/USDT, WVDX/ALP, ALP/USDT |
| Site | https://verdexswap.site (Vercel prod) |
| Miner | `Verdex Miner Setup 3.1.0.exe` |

## Phase 0 — Product truth ✅

- Brand: **Verdex** (not Verdix) across network pack and docs
- Story: Mine VP now · Trade on Verdex Swap (contracts ready)
- Chain ID: **7201** (`0x1c21`)
- Single frontend config: `js/network-config.js`
- Discovery API: `GET /api/network`

## Phase 1 — Mining harden ✅

- CORS allowlist (no open mirror of any origin)
- Heartbeat rate limit (30 / 5 min per device token)
- Faucet: 10 VDX / address / 24h + IP limit
- EVM address validation helpers
- Stronger `.gitignore` for secrets and build junk

## Phase 2 — EVM testnet pack ✅

- Config: `verdex-chain/src/config.js` → chainId 7201
- JSON-RPC: `POST /api/rpc`
- REST: `/api/chain` info returns full network pack
- Faucet page: `/faucet`
- Explorer + dashboard wired to chainId 7201
- Optional full Geth Clique: `chain/geth-testnet/`

## Phase 3 — PRC20 ✅

- Solidity: `contracts/contracts/PRC20Token.sol` (OpenZeppelin ERC20)
- Interface: `IPRC20.sol` (ERC20-identical)
- Hardhat: compile / test / deploy scripts
- Developer docs updated for PRC20 + network details

## Phase 4 — DEX Factory, Router, Aggregator, Swap UI ✅ (code)

| Component | Path |
|-----------|------|
| Factory | `contracts/contracts/swap/VerdexFactory.sol` |
| Pair + LP | `contracts/contracts/swap/VerdexPair.sol` |
| Router | `contracts/contracts/swap/VerdexRouter.sol` |
| Aggregator | `contracts/contracts/swap/VerdexAggregator.sol` |
| Fee splitter | `contracts/contracts/swap/VerdexFeeSplitter.sol` |
| WVDX | `contracts/contracts/swap/WVDX.sol` |
| Tests | `contracts/test/VerdexAMM.test.js` (17 passing w/ PRC20) |
| Deploy | `contracts/scripts/deploy-amm.js` |
| Swap UI | `swap.html` |
| Fee | **0.25%** = 0.17% LP + 0.05% treasury + 0.03% burn |

### Still needed for live trading

1. Full EVM with `eth_sendRawTransaction` (Geth Clique / hosted node)
2. `npm run deploy:amm` on Verdex network + funded deployer
3. Seed pools + set hop tokens on Aggregator
4. Fill `VERDEX_NETWORK.contracts` and set `productStatus.swap = 'live'`

## SEO / LLM ✅

- `ai.txt`, `llms.txt`, `robots.txt`, `sitemap.xml`
- Open Graph + JSON-LD on `index.html` / `swap.html`
- Canonical host: **https://verdexswap.site**

## Miner GUI ✅

- Desktop app `verdex-desktop-app` UI polished to **v3.1** (glass, motion, chain ticker)
- Dist installer: `verdex-desktop-app/dist/Verdex Miner Setup 3.0.0.exe` (rebuild for 3.1 branding)

## Stack

| Layer | Tech |
|-------|------|
| Frontend / API | Vercel |
| Auth + mining DB | Supabase |
| L1 node | `verdex-chain` / Geth scaffold |
| Contracts | Hardhat + Solidity 0.8.20 |

## Quick links

| Resource | Path |
|----------|------|
| Network config (JS) | `/js/network-config.js` |
| Network API | `/api/network` |
| JSON-RPC | `/api/rpc` |
| Swap UI | `/swap` |
| Faucet UI | `/faucet` |
| Contracts | `/contracts` |
| Miner app | `/verdex-desktop-app` |
| LLM index | `/llms.txt` |
