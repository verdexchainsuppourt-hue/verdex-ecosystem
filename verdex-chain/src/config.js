const path = require('path');

/**
 * Verdex Testnet configuration — Phase 0–3 complete.
 * Numeric chainId 7201 for MetaMask / eth_chainId compatibility.
 * DEX Factory/Router (Phase 4) intentionally not included.
 */
module.exports = {
  // ── Chain Identity ──────────────────────────────────────────────────────
  CHAIN_ID: 7201,
  CHAIN_ID_HEX: '0x1c21',
  CHAIN_ID_LEGACY: 'verdex-testnet-1',
  CHAIN_NAME: 'Verdex Testnet',
  CHAIN_TYPE: 'L1',
  SYMBOL: 'VDX',
  DECIMALS: 18,
  NETWORK_VERSION: '3',
  NETWORK_KEY: 'verdex-testnet',
  INITIAL_SUPPLY: '1000000000000000000000000000', // 1B VDX in wei-equivalent

  // Public network pack (overridable via env when hosting)
  RPC_URL: process.env.VERDEX_RPC_URL || 'https://verdex-ecosystem-production.up.railway.app',
  REST_RPC_URL: process.env.VERDEX_REST_RPC_URL || 'https://verdexswap.site/api/chain',
  EXPLORER_URL: process.env.VERDEX_EXPLORER_URL || 'https://verdexswap.site/explorer',
  FAUCET_URL: process.env.VERDEX_FAUCET_URL || 'https://verdexswap.site/faucet',
  DOCS_URL: process.env.VERDEX_DOCS_URL || 'https://verdexswap.site/developer-docs',
  WEBSITE_URL: process.env.VERDEX_WEBSITE_URL || 'https://verdexswap.site',

  // ── Consensus ──────────────────────────────────────────────────────────
  CONSENSUS: 'poa',               // Proof-of-Authority for testnet (PoS deferred)
  BLOCK_TIME: 5000,               // 5 seconds (target ~2s on dedicated EVM node)
  BLOCK_GAS_LIMIT: 15000000,      // 15M gas (Ethereum-equivalent)
  MAX_TRANSACTIONS_PER_BLOCK: 2000,

  // ── Epoch & Finality ───────────────────────────────────────────────────
  EPOCH_LENGTH: 100,
  FINALITY_DEPTH: 32,
  CHECKPOINT_INTERVAL: 32,

  // ── PoA Validators (testnet) ───────────────────────────────────────────
  GENESIS_VALIDATORS: [
    '0xeb293d5e700f2b63e5fc546b9275d68d84604b41'
  ],

  // ── Staking ────────────────────────────────────────────────────────────
  MIN_STAKE: '10000000000000000000000',       // 10,000 VDX
  VALIDATOR_REWARD: '50000000000000000000',    // 50 VDX per block

  // ── Genesis ────────────────────────────────────────────────────────────
  GENESIS_TIMESTAMP: '2026-07-11T12:00:00.000Z',
  GENESIS_DIFFICULTY: '0',
  GENESIS_HASH: '0x0000000000000000000000000000000000000000000000000000000000000000',

  // ── Network ────────────────────────────────────────────────────────────
  DEFAULT_PORT: 8545,
  P2P_PORT: 8546,
  WS_PORT: 8547,
  MAX_PEERS: 50,

  // ── Storage ────────────────────────────────────────────────────────────
  DATA_DIR: path.join(__dirname, '..', 'data'),

  // ── Mining (block rewards on L1 — separate from VP points mining) ──────
  MINING_REWARD: '50000000000000000000',
  MINING_DIFFICULTY: 4,

  // ── Faucet ─────────────────────────────────────────────────────────────
  FAUCET_AMOUNT_VDX: 10,
  FAUCET_COOLDOWN_MS: 24 * 60 * 60 * 1000,

  // ── EIP-1559 Fee Market ────────────────────────────────────────────────
  BASE_FEE: '1000000000',
  MAX_BASE_FEE: '500000000000',
  MIN_BASE_FEE: '100000000',
  BASE_FEE_CHANGE_DENOMINATOR: 8,
  ELASTICITY_MULTIPLIER: 2,
  MAX_PRIORITY_FEE: '2000000000',

  // ── Gas ────────────────────────────────────────────────────────────────
  GAS_PRICE: '1000000000',
  MIN_TX_FEE: '1000000000000000',
  GAS_COSTS: {
    TX_BASE: 21000,
    TX_DATA_ZERO: 4,
    TX_DATA_NONZERO: 16,
    CONTRACT_CREATE: 32000,
    SSTORE: 20000,
    SLOAD: 800,
    LOG: 375,
    LOG_TOPIC: 375,
    LOG_DATA: 8,
    CALL: 700,
  },

  BURN_ADDRESS: '0x000000000000000000000000000000000000dead',

  SLASH_DOUBLE_SIGN_RATE: 0.10,
  SLASH_DOWNTIME_RATE: 0.005,
  MAX_SLASH_OFFENSES: 3,
  JAIL_BLOCKS: 500,

  TX_TYPES: {
    LEGACY: 0,
    EIP1559: 1,
    STAKING: 2,
    CONTRACT: 3,
    SYSTEM: 4
  },

  BLOCK_STATES: {
    PENDING: 'pending',
    PROPOSED: 'proposed',
    FINALIZED: 'finalized'
  }
};
