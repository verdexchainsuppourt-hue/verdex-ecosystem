/**
 * Retired testnet ledger compatibility module.
 * It intentionally contains no validator material and no balance-mutating API.
 */
function retired() {
  throw new Error('The legacy Supabase testnet ledger is retired. Use an audited external mainnet RPC and indexer.');
}

module.exports = new Proxy({}, { get: retired });
