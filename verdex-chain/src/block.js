/**
 * Verdex Chain - Block
 * Authentic L1 block structure with logsBloom, receiptsRoot, extraData,
 * totalDifficulty, proper Merkle trees, and block state tracking.
 */

const crypto = require('./crypto');
const { sha256, doubleSha256 } = crypto;
const { computeTxMerkleRoot, computeMerkleRoot, getMerkleProof, verifyMerkleProof } = require('./merkle');
const config = require('./config');

class BlockHeader {
  constructor({
    height,
    previousHash,
    timestamp,
    merkleRoot,
    transactionsRoot,
    receiptsRoot,
    stateRoot,
    logsBloom,
    validator,
    signature,
    difficulty,
    totalDifficulty,
    nonce,
    gasUsed = 0,
    gasLimit,
    baseFeePerGas,
    extraData,
    epoch,
    blockState
  }) {
    this.height = height;
    this.previousHash = previousHash || '0x' + '0'.repeat(64);
    this.timestamp = timestamp || Date.now();
    this.merkleRoot = merkleRoot || '0x' + '0'.repeat(64);
    this.transactionsRoot = transactionsRoot || '0x' + '0'.repeat(64);
    this.receiptsRoot = receiptsRoot || '0x' + '0'.repeat(64);
    this.stateRoot = stateRoot || '0x' + '0'.repeat(64);
    this.logsBloom = logsBloom || '0x' + '0'.repeat(512);
    this.validator = validator || '0x' + '0'.repeat(40);
    this.signature = signature || null;
    this.difficulty = difficulty || '0x0';
    this.totalDifficulty = totalDifficulty || '0';
    this.nonce = nonce || 0;
    this.gasUsed = gasUsed;
    this.gasLimit = gasLimit || config.BLOCK_GAS_LIMIT;
    this.baseFeePerGas = baseFeePerGas || config.BASE_FEE;
    this.extraData = extraData || '0x';  // Up to 32 bytes validator metadata
    this.epoch = epoch || Math.floor((height || 0) / config.EPOCH_LENGTH);
    this.blockState = blockState || config.BLOCK_STATES.PROPOSED;
  }

  /**
   * Canonical serialization for hashing — deterministic key order.
   */
  serialize() {
    return JSON.stringify({
      height: this.height,
      previousHash: this.previousHash,
      timestamp: this.timestamp,
      merkleRoot: this.merkleRoot,
      transactionsRoot: this.transactionsRoot,
      receiptsRoot: this.receiptsRoot,
      stateRoot: this.stateRoot,
      validator: this.validator,
      difficulty: this.difficulty,
      nonce: this.nonce,
      gasUsed: this.gasUsed,
      gasLimit: this.gasLimit,
      baseFeePerGas: this.baseFeePerGas,
      extraData: this.extraData,
      epoch: this.epoch
    });
  }

  getHash() {
    return '0x' + doubleSha256(this.serialize());
  }

  sign(privateKey) {
    const hash = this.getHash();
    this.signature = crypto.sign(hash.replace('0x', ''), privateKey);
    return this;
  }

  verifySignature(validatorPublicKey) {
    if (!this.signature) return false;
    const hash = this.getHash().replace('0x', '');
    return crypto.verify(hash, this.signature, validatorPublicKey);
  }

  /**
   * Calculate next block's base fee using EIP-1559 algorithm.
   */
  calcNextBaseFee() {
    const parentBaseFee = BigInt(this.baseFeePerGas);
    const targetGas = BigInt(this.gasLimit) / BigInt(config.ELASTICITY_MULTIPLIER);
    const gasUsed = BigInt(this.gasUsed);

    if (gasUsed === targetGas) {
      return parentBaseFee.toString();
    }

    if (gasUsed > targetGas) {
      const delta = gasUsed - targetGas;
      const change = (parentBaseFee * delta) / (targetGas * BigInt(config.BASE_FEE_CHANGE_DENOMINATOR));
      const newFee = parentBaseFee + (change > 1n ? change : 1n);
      const maxFee = BigInt(config.MAX_BASE_FEE);
      return (newFee > maxFee ? maxFee : newFee).toString();
    } else {
      const delta = targetGas - gasUsed;
      const change = (parentBaseFee * delta) / (targetGas * BigInt(config.BASE_FEE_CHANGE_DENOMINATOR));
      const newFee = parentBaseFee - change;
      const minFee = BigInt(config.MIN_BASE_FEE);
      return (newFee < minFee ? minFee : newFee).toString();
    }
  }

  isFinalized() {
    return this.blockState === config.BLOCK_STATES.FINALIZED;
  }

  toJSON() {
    return {
      hash: this.getHash(),
      height: this.height,
      previousHash: this.previousHash,
      timestamp: this.timestamp,
      merkleRoot: this.merkleRoot,
      transactionsRoot: this.transactionsRoot,
      receiptsRoot: this.receiptsRoot,
      stateRoot: this.stateRoot,
      logsBloom: this.logsBloom,
      validator: this.validator,
      signature: this.signature,
      difficulty: this.difficulty,
      totalDifficulty: this.totalDifficulty,
      nonce: this.nonce,
      gasUsed: this.gasUsed,
      gasLimit: this.gasLimit,
      baseFeePerGas: this.baseFeePerGas,
      extraData: this.extraData,
      epoch: this.epoch,
      blockState: this.blockState
    };
  }
}

class Block {
  constructor({ header, transactions = [], receipts = [] }) {
    this.header = header;
    this.transactions = transactions;
    this.receipts = receipts;
    this.size = 0;
    this._updateSize();
  }

  _updateSize() {
    this.size = Buffer.from(this.serialize()).length;
  }

  serialize() {
    return JSON.stringify({
      header: this.header.toJSON(),
      transactions: this.transactions.map(tx => tx.toJSON ? tx.toJSON() : tx),
      receipts: this.receipts.map(r => r.toJSON ? r.toJSON() : r)
    });
  }

  getHash() {
    return this.header.getHash();
  }

  addTransaction(tx) {
    this.transactions.push(tx);
    this.header.gasUsed += parseInt(tx.gasLimit) || 0;
    this._updateSize();
    this.header.transactionsRoot = this._computeTxsRoot();
  }

  /**
   * Compute transactions root using proper binary Merkle tree.
   */
  _computeTxsRoot() {
    return computeTxMerkleRoot(this.transactions);
  }

  /**
   * Get SPV proof for a transaction at given index.
   */
  getTxProof(txIndex) {
    const leaves = this.transactions.map(tx =>
      tx.getHash ? tx.getHash().replace('0x', '') : sha256(JSON.stringify(tx))
    );
    return getMerkleProof(leaves, txIndex);
  }

  /**
   * Verify an SPV proof against this block's transactionsRoot.
   */
  verifyTxProof(txHash, proof) {
    return verifyMerkleProof(
      txHash.replace('0x', ''),
      proof,
      this.header.transactionsRoot
    );
  }

  finalize(stateRoot, privateKey, receipts = []) {
    this.receipts = receipts;
    this.header.transactionsRoot = this._computeTxsRoot();
    this.header.merkleRoot = this._computeMerkleRoot();
    this.header.stateRoot = stateRoot;

    // Compute receipts root
    if (receipts.length > 0) {
      const { computeReceiptsRoot, computeBlockLogsBloom } = require('./receipt');
      this.header.receiptsRoot = computeReceiptsRoot(receipts);
      this.header.logsBloom = computeBlockLogsBloom(receipts);
    }

    this._updateSize();
    if (privateKey) {
      this.header.sign(privateKey);
    }
  }

  _computeMerkleRoot() {
    const txRoot = this._computeTxsRoot().replace('0x', '');
    const headerHash = this.header.getHash().replace('0x', '');
    return '0x' + doubleSha256(txRoot + headerHash);
  }

  /**
   * Gas utilization as a percentage.
   */
  getGasUtilization() {
    if (this.header.gasLimit === 0) return 0;
    return Math.round((this.header.gasUsed / this.header.gasLimit) * 10000) / 100;
  }

  /**
   * Calculate burned fees (base fee * gas used, sent to burn address).
   */
  getBurnedFees() {
    return (BigInt(this.header.baseFeePerGas) * BigInt(this.header.gasUsed)).toString();
  }

  toJSON() {
    return {
      header: this.header.toJSON(),
      transactions: this.transactions.map(tx => tx.toJSON ? tx.toJSON() : tx),
      receipts: this.receipts.map(r => r.toJSON ? r.toJSON() : r),
      size: this.size,
      txCount: this.transactions.length,
      gasUtilization: this.getGasUtilization(),
      burnedFees: this.getBurnedFees()
    };
  }

  static fromJSON(json) {
    const { Transaction } = require('./transaction');
    const header = new BlockHeader(json.header);
    const transactions = (json.transactions || []).map(tx => Transaction.fromJSON(tx));

    let receipts = [];
    if (json.receipts && json.receipts.length > 0) {
      const { TransactionReceipt } = require('./receipt');
      receipts = json.receipts.map(r => TransactionReceipt.fromJSON(r));
    }

    const block = new Block({ header, transactions, receipts });
    block.size = json.size || block.size;
    return block;
  }

  static createGenesis(genesisAccount, initialSupply) {
    const header = new BlockHeader({
      height: 0,
      previousHash: '0x' + '0'.repeat(64),
      timestamp: Date.now() - 60000,
      difficulty: '0x0',
      totalDifficulty: '0',
      gasLimit: config.BLOCK_GAS_LIMIT,
      baseFeePerGas: config.BASE_FEE,
      merkleRoot: '0x' + '0'.repeat(64),
      extraData: '0x' + Buffer.from('Verdex Genesis Block').toString('hex'),
      epoch: 0,
      blockState: config.BLOCK_STATES.FINALIZED
    });

    const { Transaction } = require('./transaction');
    const coinbaseTx = new Transaction({
      type: config.TX_TYPES.SYSTEM,
      from: '0x' + '0'.repeat(40),
      to: genesisAccount,
      value: initialSupply,
      nonce: 0,
      data: JSON.stringify({ type: 'genesis', message: 'Verdex Testnet Genesis — July 2026' })
    });

    const block = new Block({ header, transactions: [coinbaseTx] });
    block.finalize('0x' + doubleSha256(genesisAccount), null);
    return block;
  }
}

module.exports = { Block, BlockHeader };
