/**
 * Verdex Chain - Priority Mempool
 * Sorted by (maxPriorityFeePerGas DESC, timestamp ASC).
 * Supports replace-by-fee (RBF), nonce-gap detection, and eviction policies.
 */

const config = require('./config');

class Mempool {
  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
    this.transactions = new Map();  // txHash -> tx
    this.byAddress = new Map();     // address -> Map(nonce -> txHash)
    this.stats = {
      totalAdded: 0,
      totalRemoved: 0,
      totalEvicted: 0,
      totalReplaced: 0
    };
  }

  /**
   * Add a transaction to the mempool. Supports RBF.
   * @param {Transaction} tx
   * @returns {{ accepted: boolean, replaced: string|null, reason?: string }}
   */
  add(tx) {
    const txHash = tx.getHash();

    // Already in pool
    if (this.transactions.has(txHash)) {
      return { accepted: false, reason: 'Transaction already in mempool' };
    }

    // Check for RBF — same sender + same nonce
    const senderTxs = this.byAddress.get(tx.from);
    if (senderTxs && senderTxs.has(tx.nonce)) {
      const existingHash = senderTxs.get(tx.nonce);
      const existing = this.transactions.get(existingHash);

      // RBF: new tx must pay ≥ 10% higher effective gas price
      const existingFee = BigInt(existing.maxFeePerGas || existing.gasPrice || '1000000000');
      const newFee = BigInt(tx.maxFeePerGas || tx.gasPrice || '1000000000');
      const minBump = existingFee + (existingFee / 10n); // 10% bump required

      if (newFee < minBump) {
        return { accepted: false, reason: `RBF requires ≥10% fee increase. Need ${minBump.toString()}, got ${newFee.toString()}` };
      }

      // Remove old, accept new
      this._remove(existingHash);
      this.stats.totalReplaced++;
      this._insert(tx);
      return { accepted: true, replaced: existingHash };
    }

    // Check capacity
    if (this.transactions.size >= this.maxSize) {
      // Evict lowest-fee transaction
      const lowest = this._findLowestFee();
      const txFee = BigInt(tx.maxPriorityFeePerGas || tx.gasPrice || '1000000000');
      const lowestFee = BigInt(lowest.maxPriorityFeePerGas || lowest.gasPrice || '1000000000');

      if (txFee <= lowestFee) {
        return { accepted: false, reason: 'Mempool full, fee too low' };
      }

      this._remove(lowest.getHash());
      this.stats.totalEvicted++;
    }

    this._insert(tx);
    return { accepted: true, replaced: null };
  }

  _insert(tx) {
    const txHash = tx.getHash();
    this.transactions.set(txHash, tx);

    if (!this.byAddress.has(tx.from)) {
      this.byAddress.set(tx.from, new Map());
    }
    this.byAddress.get(tx.from).set(tx.nonce, txHash);
    this.stats.totalAdded++;
  }

  _remove(txHash) {
    const tx = this.transactions.get(txHash);
    if (!tx) return;

    this.transactions.delete(txHash);
    const senderTxs = this.byAddress.get(tx.from);
    if (senderTxs) {
      senderTxs.delete(tx.nonce);
      if (senderTxs.size === 0) {
        this.byAddress.delete(tx.from);
      }
    }
    this.stats.totalRemoved++;
  }

  remove(txHash) {
    this._remove(txHash);
  }

  get(txHash) {
    return this.transactions.get(txHash) || null;
  }

  has(txHash) {
    return this.transactions.has(txHash);
  }

  /**
   * Get pending transactions sorted by fee (highest first) then timestamp (earliest first).
   */
  getPendingTransactions(limit) {
    const all = [...this.transactions.values()];

    all.sort((a, b) => {
      const feeA = BigInt(a.maxPriorityFeePerGas || a.gasPrice || '1000000000');
      const feeB = BigInt(b.maxPriorityFeePerGas || b.gasPrice || '1000000000');
      if (feeA !== feeB) return feeA > feeB ? -1 : 1;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    return limit ? all.slice(0, limit) : all;
  }

  /**
   * Get transactions for a specific address, sorted by nonce.
   */
  getByAddress(address) {
    const senderTxs = this.byAddress.get(address);
    if (!senderTxs) return [];

    return [...senderTxs.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([_, hash]) => this.transactions.get(hash))
      .filter(Boolean);
  }

  /**
   * Detect nonce gaps for a given sender.
   * @param {string} address
   * @param {number} currentNonce - the account's current on-chain nonce
   * @returns {{ hasGap: boolean, expectedNonce: number, pending: number[] }}
   */
  detectNonceGaps(address, currentNonce) {
    const senderTxs = this.byAddress.get(address);
    if (!senderTxs || senderTxs.size === 0) {
      return { hasGap: false, expectedNonce: currentNonce, pending: [] };
    }

    const nonces = [...senderTxs.keys()].sort((a, b) => a - b);
    let expected = currentNonce;
    let hasGap = false;

    for (const nonce of nonces) {
      if (nonce !== expected) {
        hasGap = true;
        break;
      }
      expected++;
    }

    return { hasGap, expectedNonce: expected, pending: nonces };
  }

  _findLowestFee() {
    let lowest = null;
    let lowestFee = null;

    for (const tx of this.transactions.values()) {
      const fee = BigInt(tx.maxPriorityFeePerGas || tx.gasPrice || '1000000000');
      if (lowestFee === null || fee < lowestFee || (fee === lowestFee && tx.timestamp < lowest.timestamp)) {
        lowest = tx;
        lowestFee = fee;
      }
    }
    return lowest;
  }

  getCount() {
    return this.transactions.size;
  }

  getStats() {
    const txs = [...this.transactions.values()];
    let totalGas = 0n;
    let totalFees = 0n;

    for (const tx of txs) {
      const gas = BigInt(tx.gasLimit || 21000);
      const price = BigInt(tx.maxFeePerGas || tx.gasPrice || '1000000000');
      totalGas += gas;
      totalFees += gas * price;
    }

    return {
      pending: this.transactions.size,
      totalGas: totalGas.toString(),
      totalFees: totalFees.toString(),
      ...this.stats
    };
  }

  toJSON() {
    return this.getPendingTransactions().map(tx => tx.toJSON ? tx.toJSON() : tx);
  }

  clear() {
    this.transactions.clear();
    this.byAddress.clear();
  }
}

module.exports = Mempool;
