class TransactionPool {
  constructor() {
    this.transactions = new Map(); // hash -> Transaction
    this.pendingOrder = [];
  }

  add(tx) {
    const hash = tx.getHash();
    if (!this.transactions.has(hash)) {
      this.transactions.set(hash, tx);
      this.pendingOrder.push(hash);
    }
  }

  remove(hash) {
    this.transactions.delete(hash);
    this.pendingOrder = this.pendingOrder.filter(h => h !== hash);
  }

  getPendingTransactions() {
    return this.pendingOrder.map(hash => this.transactions.get(hash)).filter(Boolean);
  }

  getTransaction(hash) {
    return this.transactions.get(hash) || null;
  }

  getCount() {
    return this.transactions.size;
  }

  clear() {
    this.transactions.clear();
    this.pendingOrder = [];
  }

  toJSON() {
    return this.getPendingTransactions().map(tx => tx.toJSON());
  }
}

module.exports = TransactionPool;
