/**
 * Verdex Chain - Transaction Receipt
 * Mirrors Ethereum's receipt model. Each included transaction produces a receipt
 * that records execution status, gas consumed, contract creation address, and event logs.
 */

const { sha256, doubleSha256 } = require('./crypto');
const { computeMerkleRoot } = require('./merkle');

// ── Event Log ────────────────────────────────────────────────────────────────

class EventLog {
  constructor({ address, topics = [], data = '0x', logIndex = 0, transactionHash = '', blockHash = '', blockNumber = 0 }) {
    this.address = address;                // Contract that emitted the event
    this.topics = topics;                  // Indexed topics (event signature + indexed params)
    this.data = data;                      // ABI-encoded non-indexed params
    this.logIndex = logIndex;
    this.transactionHash = transactionHash;
    this.blockHash = blockHash;
    this.blockNumber = blockNumber;
  }

  toJSON() {
    return {
      address: this.address,
      topics: this.topics,
      data: this.data,
      logIndex: this.logIndex,
      transactionHash: this.transactionHash,
      blockHash: this.blockHash,
      blockNumber: this.blockNumber
    };
  }

  static fromJSON(json) {
    return new EventLog(json);
  }
}

// ── Logs Bloom ────────────────────────────────────────────────────────────────

/**
 * Simplified 256-byte Bloom filter for event log indexing.
 * Sets 3 bits for each address/topic, allows quick O(1) membership tests.
 */
class LogsBloom {
  constructor() {
    this.bytes = new Uint8Array(256);
  }

  add(value) {
    const hash = sha256(value.replace('0x', ''));
    // Set 3 bits from the hash
    for (let i = 0; i < 3; i++) {
      const byteIndex = parseInt(hash.slice(i * 4, i * 4 + 4), 16) % 256;
      const bitIndex = parseInt(hash.slice(i * 4 + 2, i * 4 + 4), 16) % 8;
      this.bytes[byteIndex] |= (1 << bitIndex);
    }
  }

  addLog(log) {
    this.add(log.address);
    for (const topic of log.topics) {
      this.add(topic);
    }
  }

  test(value) {
    const hash = sha256(value.replace('0x', ''));
    for (let i = 0; i < 3; i++) {
      const byteIndex = parseInt(hash.slice(i * 4, i * 4 + 4), 16) % 256;
      const bitIndex = parseInt(hash.slice(i * 4 + 2, i * 4 + 4), 16) % 8;
      if (!(this.bytes[byteIndex] & (1 << bitIndex))) return false;
    }
    return true;
  }

  toHex() {
    return '0x' + Buffer.from(this.bytes).toString('hex');
  }

  static fromHex(hex) {
    const bloom = new LogsBloom();
    const clean = hex.replace('0x', '');
    if (clean.length === 512) {
      bloom.bytes = new Uint8Array(Buffer.from(clean, 'hex'));
    }
    return bloom;
  }

  static fromLogs(logs) {
    const bloom = new LogsBloom();
    for (const log of logs) {
      bloom.addLog(log);
    }
    return bloom;
  }
}

// ── Transaction Receipt ───────────────────────────────────────────────────────

class TransactionReceipt {
  constructor({
    transactionHash,
    transactionIndex = 0,
    blockHash = '',
    blockNumber = 0,
    from,
    to = null,
    contractAddress = null,   // Populated for deployments
    gasUsed = 0,
    cumulativeGasUsed = 0,
    effectiveGasPrice = '1000000000',
    status = 1,               // 1 = success, 0 = failure
    logs = [],
    logsBloom = null,
    type = 0                  // 0=legacy, 1=eip1559, 2=staking
  }) {
    this.transactionHash = transactionHash;
    this.transactionIndex = transactionIndex;
    this.blockHash = blockHash;
    this.blockNumber = blockNumber;
    this.from = from;
    this.to = to;
    this.contractAddress = contractAddress;
    this.gasUsed = gasUsed;
    this.cumulativeGasUsed = cumulativeGasUsed;
    this.effectiveGasPrice = effectiveGasPrice;
    this.status = status;
    this.logs = logs.map(l => l instanceof EventLog ? l : new EventLog(l));
    this.logsBloom = logsBloom || LogsBloom.fromLogs(this.logs).toHex();
    this.type = type;
  }

  /**
   * Hash of this receipt for receipt Merkle tree
   */
  getHash() {
    return '0x' + sha256(JSON.stringify({
      transactionHash: this.transactionHash,
      status: this.status,
      gasUsed: this.gasUsed,
      logs: this.logs.map(l => l.toJSON())
    }));
  }

  toJSON() {
    return {
      transactionHash: this.transactionHash,
      transactionIndex: this.transactionIndex,
      blockHash: this.blockHash,
      blockNumber: this.blockNumber,
      from: this.from,
      to: this.to,
      contractAddress: this.contractAddress,
      gasUsed: this.gasUsed,
      cumulativeGasUsed: this.cumulativeGasUsed,
      effectiveGasPrice: this.effectiveGasPrice,
      status: this.status,
      statusText: this.status === 1 ? 'Success' : 'Failed',
      logs: this.logs.map(l => l.toJSON()),
      logsBloom: this.logsBloom,
      type: this.type
    };
  }

  static fromJSON(json) {
    return new TransactionReceipt({
      ...json,
      logs: (json.logs || []).map(l => new EventLog(l))
    });
  }
}

// ── Receipt Root ─────────────────────────────────────────────────────────────

/**
 * Compute the receipts Merkle root from an array of TransactionReceipts.
 */
function computeReceiptsRoot(receipts) {
  if (receipts.length === 0) {
    return '0x' + '0'.repeat(64);
  }
  const leaves = receipts.map(r => r.getHash().replace('0x', ''));
  return computeMerkleRoot(leaves);
}

/**
 * Build a combined block logsBloom from multiple receipts.
 */
function computeBlockLogsBloom(receipts) {
  const bloom = new LogsBloom();
  for (const receipt of receipts) {
    for (const log of receipt.logs) {
      bloom.addLog(log);
    }
  }
  return bloom.toHex();
}

module.exports = {
  EventLog,
  LogsBloom,
  TransactionReceipt,
  computeReceiptsRoot,
  computeBlockLogsBloom
};
