# Verdex Contracts

> Mainnet is **not deployed**. The only production-candidate contracts are the
> immutable PRC20 VDX and P2P escrow under `contracts/mainnet/`; deployment is
> blocked on the validator ceremony, Safe custody, staging rehearsal, audit,
> and release evidence described in `../MAINNET_NODE_RUNBOOK.md`.

## Historical testnet AMM source — archive only

| Item | Value |
|------|--------|
| Chain | Verdex Testnet |
| Chain ID | **7201** (`0x1c21`) |
| Native gas | VDX |
| PRC20 | ERC-20 compatible fungible standard |
| AMM | Uniswap-V2-style + Verdex 0.25% fee |

## Fee structure (every swap)

| Recipient | BPS | Percent |
|-----------|-----|---------|
| Liquidity Providers | 17 | 0.17% |
| Protocol Treasury | 5 | 0.05% |
| VDX Burn (`0x…dEaD`) | 3 | 0.03% |
| **Total** | **25** | **0.25%** |

Constant product: `x × y = k`  
Amount out: `(amountIn × 9975 × reserveOut) / (reserveIn × 10000 + amountIn × 9975)`

Protocol share (8/25 of fees) is minted as LP to `VerdexFeeSplitter`, which splits underlyings **5/8 treasury · 3/8 burn**.

## Layout

```
contracts/
  contracts/
    IPRC20.sol
    PRC20Token.sol
    swap/
      VerdexFactory.sol
      VerdexPair.sol
      VerdexERC20.sol
      VerdexRouter.sol
      VerdexAggregator.sol
      VerdexFeeSplitter.sol
      WVDX.sol
      interfaces/
      libraries/
  scripts/
    deploy-prc20.js
    deploy-amm.js
  test/
    PRC20Token.test.js
    VerdexAMM.test.js
  deployments/
    hardhat-amm.json   # written by deploy-amm
```

## Install & test

```bash
cd contracts
npm install
npm run compile
npm test
```

All AMM + PRC20 tests should pass (17 tests at Phase 4 ship).

## Historical local test workflow — do not deploy

```bash
# Local Hardhat (chainId 7201)
npm run deploy:amm:local

# Historical developer-only RPC example (never point this at real funds)
set PRIVATE_KEY=0xYOUR_KEY
set TREASURY=0xYourTreasury
set VERDEX_RPC_URL=https://rpc.verdexswap.site/rpc
npm run deploy:amm
```

Outputs addresses to `deployments/<network>-amm.json`. Paste them into `js/network-config.js` → `VERDEX_NETWORK.contracts`.

## Deploy PRC20

```bash
npm run deploy:prc20:local
# or
npm run deploy:prc20
```

Optional env: `TOKEN_NAME`, `TOKEN_SYMBOL`, `TOKEN_DECIMALS`, `TOKEN_SUPPLY`.

## Aggregator behaviour

1. User specifies `tokenIn`, `tokenOut`, `amountIn`, `amountOutMin`
2. `VerdexAggregator.findBestRoute` scores direct + hop paths (via `hopTokens`, default WVDX)
3. Best path executed with slippage guard (`amountOutMin`)
4. Multi-hop atomic via pair → pair transfers

## After deploy

1. Import WVDX / PRC20 tokens in MetaMask on **Verdex Testnet (7201)**
2. Seed liquidity via `VerdexRouter.addLiquidity`
3. Point frontend `VERDEX_NETWORK.contracts` at deployed addresses
4. Enable swap button on `/swap.html` when `productStatus.swap === 'live'`

## Mainnet contract source (not deployed)

`contracts/mainnet/VerdexMainnetVDX.sol` is a separate, non-upgradeable VDX
asset. It mints exactly **1,000,000,000 VDX** once to the Genesis Vault and has
no owner or minter; holders can burn but the supply can never increase.

`contracts/mainnet/VerdexP2PEscrow.sol` is a separate VDX-only P2P escrow. A
current in-house KYC/P2P attestor must provide a one-use, time-limited EIP-712
authorization before an escrow may be funded. That attestor cannot move funds.
The buyer marks fiat payment, the seller releases VDX, and a dispute requires a
threshold of independent arbiter signatures. The generated ABI is at
`artifacts/contracts/mainnet/VerdexP2PEscrow.sol/VerdexP2PEscrow.json` under
`abi` after `npm run compile`.

Use the `mainnet/GENESIS_ALLOCATION.template.json` only as a signed-review
template; every recipient is intentionally a placeholder until a multisig key
ceremony, legal review, staging deployment, and independent audit are complete.
