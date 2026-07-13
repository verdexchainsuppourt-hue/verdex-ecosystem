/**
 * Verdex Chain - Consensus (PoA with Epochs, Slashing, Finality)
 * Epoch-based validator rotation with weighted stake selection,
 * finality checkpoints, validator scoring, and slashing integration.
 */

const crypto = require('./crypto');
const config = require('./config');
const { Block, BlockHeader } = require('./block');
const { Transaction, RewardTransaction } = require('./transaction');
const { TransactionReceipt, EventLog, computeReceiptsRoot, computeBlockLogsBloom } = require('./receipt');
const { SlashingManager, OFFENSE_TYPES } = require('./slashing');

class PoAConsensus {
  constructor(blockchain) {
    this.blockchain = blockchain;
    this.validators = new Map();        // address -> { publicKey, stake, isActive }
    this.currentValidatorIndex = 0;
    this.currentEpoch = 0;
    this.epochStartHeight = 0;
    this.slashing = new SlashingManager();
    this.finalizedHeight = 0;           // Highest finalized block
    this.checkpoints = new Map();       // height -> blockHash
    this.blockTimes = [];               // Recent block times for avg calculation
  }

  async init() {
    const stored = await this.blockchain.db.getValidators();
    if (stored && stored.length > 0) {
      stored.forEach(v => {
        this.validators.set(v.address, {
          publicKey: v.publicKey || '',
          stake: v.stake || config.MIN_STAKE,
          isActive: v.isActive !== false
        });
        // Init scoring
        this.slashing.getOrCreateScore(v.address);
      });
    } else {
      config.GENESIS_VALIDATORS.forEach(addr => {
        this.validators.set(addr, {
          publicKey: '',
          stake: config.MIN_STAKE,
          isActive: true
        });
        this.slashing.getOrCreateScore(addr);
      });
    }
  }

  // ── Epoch Management ────────────────────────────────────────────────────

  getCurrentEpoch() {
    return this.currentEpoch;
  }

  getEpochProgress(currentHeight) {
    const intoEpoch = currentHeight - this.epochStartHeight;
    return {
      epoch: this.currentEpoch,
      blocksInEpoch: intoEpoch,
      epochLength: config.EPOCH_LENGTH,
      progress: Math.round((intoEpoch / config.EPOCH_LENGTH) * 10000) / 100,
      blocksRemaining: config.EPOCH_LENGTH - intoEpoch
    };
  }

  _checkEpochTransition(height) {
    const newEpoch = Math.floor(height / config.EPOCH_LENGTH);
    if (newEpoch > this.currentEpoch) {
      this.currentEpoch = newEpoch;
      this.epochStartHeight = newEpoch * config.EPOCH_LENGTH;
      this.currentValidatorIndex = 0;
      console.log(`[Consensus] ⚡ Epoch transition → Epoch #${newEpoch} at height ${height}`);
      return true;
    }
    return false;
  }

  // ── Validator Selection ─────────────────────────────────────────────────

  getCurrentValidator() {
    const active = this._getActiveValidators();
    if (active.length === 0) return null;
    const idx = this.currentValidatorIndex % active.length;
    return active[idx].address;
  }

  /**
   * Get validators sorted by weighted stake + score.
   */
  _getActiveValidators() {
    const currentHeight = this.blockchain.state ? 0 : 0;
    return [...this.validators.entries()]
      .filter(([addr, v]) => {
        if (!v.isActive) return false;
        const score = this.slashing.scores.get(addr);
        if (score && !score.isEligible(currentHeight)) return false;
        return true;
      })
      .map(([addr, v]) => {
        const score = this.slashing.scores.get(addr);
        return {
          address: addr,
          stake: BigInt(v.stake || '0'),
          score: score ? score.score : 100,
          weight: this._calcWeight(v.stake, score)
        };
      })
      .sort((a, b) => b.weight - a.weight);
  }

  _calcWeight(stake, score) {
    const stakeWeight = Number(BigInt(stake || '0') / BigInt(10 ** 18));
    const scoreWeight = score ? score.score : 100;
    return stakeWeight * 0.6 + scoreWeight * 0.4;
  }

  rotateValidator() {
    const active = this._getActiveValidators();
    if (active.length === 0) return;
    this.currentValidatorIndex = (this.currentValidatorIndex + 1) % active.length;
  }

  isValidator(address) {
    const v = this.validators.get(address);
    if (!v || !v.isActive) return false;
    const score = this.slashing.scores.get(address);
    if (score && (score.isBanned || score.jailedUntil > 0)) return false;
    return true;
  }

  async registerValidator(address, publicKey, stake) {
    if (BigInt(stake) < BigInt(config.MIN_STAKE)) {
      throw new Error(`Minimum stake is ${config.MIN_STAKE} VDX`);
    }
    this.validators.set(address, {
      publicKey,
      stake,
      isActive: true
    });
    this.slashing.getOrCreateScore(address);
    await this._saveValidators();
  }

  // ── Block Proposal ──────────────────────────────────────────────────────

  async proposeBlock(validatorPrivateKey) {
    const validatorAddress = crypto.privateKeyToAddress(validatorPrivateKey);
    if (!this.isValidator(validatorAddress)) {
      throw new Error('Not an active validator');
    }

    const latestBlock = await this.blockchain.getLatestBlock();
    const latestHeight = latestBlock ? latestBlock.header.height : -1;
    const newHeight = latestHeight + 1;

    // Check epoch transition
    this._checkEpochTransition(newHeight);

    // Calculate base fee from parent block (EIP-1559)
    const parentBaseFee = latestBlock ? latestBlock.header.baseFeePerGas : config.BASE_FEE;
    const nextBaseFee = latestBlock ? latestBlock.header.calcNextBaseFee() : config.BASE_FEE;

    // Calculate total difficulty
    const parentTotalDifficulty = latestBlock ? BigInt(latestBlock.header.totalDifficulty || '0') : 0n;
    const blockDifficulty = 1n;
    const totalDifficulty = (parentTotalDifficulty + blockDifficulty).toString();

    const header = new BlockHeader({
      height: newHeight,
      previousHash: latestBlock ? latestBlock.getHash() : '0x' + '0'.repeat(64),
      timestamp: Date.now(),
      difficulty: '0x1',
      totalDifficulty,
      validator: validatorAddress,
      gasLimit: config.BLOCK_GAS_LIMIT,
      baseFeePerGas: nextBaseFee,
      extraData: '0x' + Buffer.from(`v:${validatorAddress.slice(2, 10)}`).toString('hex'),
      epoch: Math.floor(newHeight / config.EPOCH_LENGTH),
      blockState: config.BLOCK_STATES.PROPOSED
    });

    const block = new Block({ header });
    const receipts = [];

    // Add coinbase reward
    const rewardTx = new RewardTransaction({
      to: validatorAddress,
      value: config.VALIDATOR_REWARD,
      blockHeight: newHeight,
      nonce: 0
    });
    block.addTransaction(rewardTx);
    receipts.push(new TransactionReceipt({
      transactionHash: rewardTx.getHash(),
      transactionIndex: 0,
      from: rewardTx.from,
      to: rewardTx.to,
      gasUsed: 0,
      status: 1,
      type: config.TX_TYPES.SYSTEM,
      logs: [new EventLog({
        address: '0x' + '0'.repeat(40),
        topics: ['0x' + crypto.sha256('BlockReward(address,uint256)')],
        data: JSON.stringify({ validator: validatorAddress, reward: config.VALIDATOR_REWARD })
      })]
    }));

    // Add pending transactions, sorted by priority fee
    const pendingTxs = this.blockchain.txPool.getPendingTransactions();
    let gasUsed = 0;
    let txIndex = 1;
    let totalPriorityFees = 0n;
    let totalBurnedFees = 0n;

    for (const tx of pendingTxs) {
      const txGas = parseInt(tx.gasLimit) || 21000;
      if (gasUsed + txGas > config.BLOCK_GAS_LIMIT) break;
      if (block.transactions.length >= config.MAX_TRANSACTIONS_PER_BLOCK) break;

      try {
        // Verify effective gas price covers base fee
        const effectivePrice = BigInt(tx.getEffectiveGasPrice(nextBaseFee));
        if (effectivePrice < BigInt(nextBaseFee)) continue;

        block.addTransaction(tx);

        // Calculate fees
        const baseFee = BigInt(nextBaseFee);
        const priorityFee = effectivePrice - baseFee;
        totalPriorityFees += priorityFee * BigInt(txGas);
        totalBurnedFees += baseFee * BigInt(txGas);

        // Create receipt
        receipts.push(new TransactionReceipt({
          transactionHash: tx.getHash(),
          transactionIndex: txIndex,
          from: tx.from,
          to: tx.to,
          contractAddress: tx.contractAddress,
          gasUsed: txGas,
          cumulativeGasUsed: gasUsed + txGas,
          effectiveGasPrice: effectivePrice.toString(),
          status: 1,
          type: tx.type,
          logs: []
        }));

        gasUsed += txGas;
        txIndex++;
      } catch {
        continue;
      }
    }

    // Record block time
    if (latestBlock) {
      const blockTime = header.timestamp - latestBlock.header.timestamp;
      this.blockTimes.push(blockTime);
      if (this.blockTimes.length > 100) this.blockTimes.shift();
    }

    // Apply state and finalize
    const stateRoot = await this.blockchain.state.getStateRoot();
    block.finalize(stateRoot, validatorPrivateKey, receipts);

    const valid = await this.blockchain.addBlock(block);
    if (valid) {
      // Record validator performance
      this.slashing.recordBlockProposal(validatorAddress, newHeight);
      this.rotateValidator();

      // Remove included txs from pool
      for (const tx of block.transactions) {
        this.blockchain.txPool.remove(tx.getHash());
      }

      // Check finality
      this._updateFinality(newHeight);
    }

    return valid ? block : null;
  }

  // ── Finality ────────────────────────────────────────────────────────────

  _updateFinality(currentHeight) {
    const newFinalized = currentHeight - config.FINALITY_DEPTH;
    if (newFinalized > this.finalizedHeight && newFinalized >= 0) {
      this.finalizedHeight = newFinalized;

      // Save checkpoint
      if (newFinalized % config.CHECKPOINT_INTERVAL === 0) {
        this.checkpoints.set(newFinalized, 'pending'); // Will be filled with block hash
        console.log(`[Consensus] ✓ Finality checkpoint at block #${newFinalized}`);
      }
    }
  }

  getFinalityInfo(currentHeight) {
    return {
      finalizedHeight: this.finalizedHeight,
      pendingHeight: currentHeight,
      confirmationsNeeded: config.FINALITY_DEPTH,
      latestCheckpoint: Math.max(...[0, ...this.checkpoints.keys()])
    };
  }

  // ── Block Validation ────────────────────────────────────────────────────

  async validateBlock(block) {
    // Verify validator
    if (!this.isValidator(block.header.validator)) {
      throw new Error('Block proposed by non-validator');
    }

    // Check block height continuity
    const latestBlock = await this.blockchain.getLatestBlock();
    if (latestBlock && block.header.height !== latestBlock.header.height + 1) {
      throw new Error(`Invalid block height: expected ${latestBlock.header.height + 1}, got ${block.header.height}`);
    }

    // Check previous hash
    if (latestBlock && block.header.previousHash !== latestBlock.getHash()) {
      throw new Error('Previous hash mismatch');
    }

    // Verify timestamp
    if (latestBlock && block.header.timestamp <= latestBlock.header.timestamp) {
      throw new Error('Block timestamp not after previous block');
    }

    // Verify gas limit
    if (block.header.gasUsed > block.header.gasLimit) {
      throw new Error('Gas used exceeds gas limit');
    }

    // Verify base fee
    if (latestBlock) {
      const expectedBaseFee = latestBlock.header.calcNextBaseFee();
      if (block.header.baseFeePerGas !== expectedBaseFee) {
        // Soft check — log warning but don't reject
        console.warn(`[Consensus] Base fee mismatch: expected ${expectedBaseFee}, got ${block.header.baseFeePerGas}`);
      }
    }

    // Double-sign detection
    if (this.slashing.checkDoubleSigning(block.header.validator, block.header.height)) {
      console.error(`[Consensus] ⚠️ DOUBLE SIGN detected: ${block.header.validator} at height ${block.header.height}`);
      const v = this.validators.get(block.header.validator);
      if (v) {
        this.slashing.slash(block.header.validator, OFFENSE_TYPES.DOUBLE_SIGN, v.stake, block.header.height);
      }
      throw new Error('Double signing detected');
    }

    // Verify transaction signatures
    for (const tx of block.transactions) {
      if (!tx.verify()) {
        throw new Error(`Invalid transaction signature for hash ${tx.getHash()}`);
      }
    }

    return true;
  }

  // ── Network Stats ──────────────────────────────────────────────────────

  getAvgBlockTime() {
    if (this.blockTimes.length === 0) return config.BLOCK_TIME;
    const sum = this.blockTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.blockTimes.length);
  }

  getTPS() {
    const avgBlockTime = this.getAvgBlockTime();
    if (avgBlockTime === 0) return 0;
    // Estimate based on recent blocks
    return Math.round((config.MAX_TRANSACTIONS_PER_BLOCK / (avgBlockTime / 1000)) * 100) / 100;
  }

  getValidatorDetails() {
    return [...this.validators.entries()].map(([addr, v]) => {
      const score = this.slashing.scores.get(addr);
      return {
        address: addr,
        publicKey: v.publicKey,
        stake: v.stake,
        isActive: v.isActive,
        score: score ? score.toJSON() : null,
        slashingHistory: this.slashing.getSlashingHistory(addr)
      };
    });
  }

  async _saveValidators() {
    const data = [...this.validators.entries()].map(([addr, v]) => ({
      address: addr,
      publicKey: v.publicKey,
      stake: v.stake,
      isActive: v.isActive
    }));
    await this.blockchain.db.putValidators(data);
  }
}

module.exports = PoAConsensus;
