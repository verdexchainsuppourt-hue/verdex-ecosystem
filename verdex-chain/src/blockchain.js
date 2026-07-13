/**
 * Verdex Chain - Blockchain
 * Core blockchain with block range queries, transaction search, network stats,
 * receipt storage, fee burning, and mempool integration.
 */

const ChainDB = require('./database');
const { Block, BlockHeader } = require('./block');
const { Transaction, RewardTransaction } = require('./transaction');
const { StateDB } = require('./state');
const PoAConsensus = require('./consensus');
const Mempool = require('./mempool');
const { TransactionReceipt } = require('./receipt');
const crypto = require('./crypto');
const config = require('./config');

class Blockchain {
  constructor(dataDir) {
    this.db = new ChainDB(dataDir);
    this.state = new StateDB();
    this.txPool = new Mempool(10000);
    this.consensus = new PoAConsensus(this);
    this.isRunning = false;
    this.blockListeners = [];
    this.txListeners = [];
    this.receiptCache = new Map();      // txHash -> receipt
    this.stats = {
      totalTransactions: 0,
      totalBurned: '0',
      startTime: Date.now()
    };
  }

  async init(reset = false) {
    await this.db.init();
    await this.consensus.init();

    const chainInfo = await this.db.getChainInfo();
    if (!chainInfo || reset) {
      await this._initGenesis();
    } else {
      await this._loadState();
      // Restore stats
      if (chainInfo.stats) {
        this.stats = { ...this.stats, ...chainInfo.stats };
      }
    }

    this.isRunning = true;
  }

  async _initGenesis() {
    const genesisAccount = config.GENESIS_VALIDATORS[0];
    const block = Block.createGenesis(genesisAccount, config.INITIAL_SUPPLY);

    // Apply genesis state
    this.state.mint(genesisAccount, config.INITIAL_SUPPLY);
    const stateRoot = this.state.getStateRoot();
    block.finalize(stateRoot, null);

    // Distribute initial supply to genesis validators
    for (let i = 1; i < config.GENESIS_VALIDATORS.length; i++) {
      const share = BigInt(config.INITIAL_SUPPLY) / BigInt(config.GENESIS_VALIDATORS.length);
      this.state.transfer(genesisAccount, config.GENESIS_VALIDATORS[i], share.toString());
    }

    // Initialize consensus validators from config
    this.consensus.validators.clear();
    const valList = [];
    for (const addr of config.GENESIS_VALIDATORS) {
      this.consensus.validators.set(addr, {
        publicKey: '',
        stake: '0',
        isActive: true
      });
      valList.push({ address: addr, publicKey: '', stake: '0', isActive: true });
    }

    await this.db.putBlock(0, block.toJSON());
    await this.db.setLatestHeight(0);
    await this.db.putState(0, this.state.toJSON());
    await this.db.putValidators(valList);
    await this.db.putChainInfo({
      chainId: config.CHAIN_ID,
      name: config.CHAIN_NAME,
      symbol: config.SYMBOL,
      genesisHash: block.getHash(),
      startTime: block.header.timestamp,
      validators: config.GENESIS_VALIDATORS,
      stats: this.stats
    });

    console.log(`[Blockchain] Genesis block created: ${block.getHash()}`);
  }

  async _loadState() {
    const height = await this.db.getLatestHeight();
    if (height >= 0) {
      const stateData = await this.db.getState(height);
      if (stateData) {
        this.state.restore(stateData);
      }
      console.log(`[Blockchain] State loaded at height ${height}`);
    }
  }

  // ── Block Queries ──────────────────────────────────────────────────────

  async getLatestBlock() {
    return this.db.getLatestBlock().then(data => {
      if (!data) return null;
      try { return Block.fromJSON(data); } catch { return null; }
    });
  }

  async getBlock(height) {
    const data = await this.db.getBlock(height);
    if (!data) return null;
    try { return Block.fromJSON(data); } catch { return null; }
  }

  /**
   * Get a range of blocks [fromHeight, toHeight].
   */
  async getBlockRange(fromHeight, toHeight) {
    const blocks = [];
    const clampedTo = Math.min(toHeight, fromHeight + 50); // Max 50 blocks per query
    for (let h = fromHeight; h <= clampedTo; h++) {
      const block = await this.getBlock(h);
      if (block) blocks.push(block);
    }
    return blocks;
  }

  /**
   * Get recent blocks (latest N).
   */
  async getRecentBlocks(count = 10) {
    const latest = await this.getLatestBlock();
    if (!latest) return [];
    const from = Math.max(0, latest.header.height - count + 1);
    return this.getBlockRange(from, latest.header.height);
  }

  // ── Block Addition ─────────────────────────────────────────────────────

  async addBlock(block) {
    try {
      await this.consensus.validateBlock(block);

      // Apply transactions to state
      for (const tx of block.transactions) {
        this.state.applyTransaction(tx);
      }

      // Burn base fees
      const burnedFees = block.getBurnedFees();
      if (BigInt(burnedFees) > 0n) {
        this.state.burn(burnedFees);
        this.stats.totalBurned = (BigInt(this.stats.totalBurned) + BigInt(burnedFees)).toString();
      }

      // Store block
      await this.db.putBlock(block.header.height, block.toJSON());
      await this.db.setLatestHeight(block.header.height);
      await this.db.putState(block.header.height, this.state.toJSON());

      // Store transactions and receipts
      for (let i = 0; i < block.transactions.length; i++) {
        const tx = block.transactions[i];
        await this.db.putTransaction(tx.getHash(), tx.toJSON(), block.header.height);
        this.stats.totalTransactions++;

        // Cache receipt
        if (block.receipts && block.receipts[i]) {
          const receipt = block.receipts[i];
          receipt.blockHash = block.getHash();
          receipt.blockNumber = block.header.height;
          this.receiptCache.set(tx.getHash(), receipt);
        }
      }

      // Update finality state for older blocks
      if (block.header.height >= config.FINALITY_DEPTH) {
        const finalizedHeight = block.header.height - config.FINALITY_DEPTH;
        // Mark block as finalized in DB
        const finalizedBlock = await this.db.getBlock(finalizedHeight);
        if (finalizedBlock) {
          finalizedBlock.header = finalizedBlock.header || {};
          finalizedBlock.header.blockState = config.BLOCK_STATES.FINALIZED;
          await this.db.putBlock(finalizedHeight, finalizedBlock);
        }
      }

      // Notify listeners
      this.blockListeners.forEach(cb => cb(block));

      console.log(`[Blockchain] Block #${block.header.height} added: ${block.getHash()} (${block.transactions.length} txns, gas: ${block.header.gasUsed}/${block.header.gasLimit}, baseFee: ${block.header.baseFeePerGas})`);
      return true;
    } catch (err) {
      console.error(`[Blockchain] Block rejected: ${err.message}`);
      return false;
    }
  }

  // ── Transaction Submission ─────────────────────────────────────────────

  async sendTransaction(tx) {
    // Validate address format
    if (!tx.from || !crypto.isValidAddress(tx.from)) {
      throw new Error('Invalid sender address');
    }
    if (tx.to && !crypto.isValidAddress(tx.to)) {
      throw new Error('Invalid recipient address');
    }

    // Verify signature
    if (!tx.verify()) {
      throw new Error('Invalid transaction signature');
    }

    // Check nonce
    const expectedNonce = this.state.getNonce(tx.from);
    if (tx.nonce !== expectedNonce) {
      // Allow if tx is already queued with correct nonce sequence
      const queued = this.txPool.getByAddress(tx.from);
      const maxQueuedNonce = queued.length > 0 ? Math.max(...queued.map(t => t.nonce)) : expectedNonce - 1;
      if (tx.nonce !== maxQueuedNonce + 1 && tx.nonce !== expectedNonce) {
        throw new Error(`Invalid nonce: expected ${expectedNonce}, got ${tx.nonce}`);
      }
    }

    // Check balance
    const balance = BigInt(this.state.getBalance(tx.from));
    const latestBlock = await this.getLatestBlock();
    const baseFee = latestBlock ? latestBlock.header.baseFeePerGas : config.BASE_FEE;
    const totalCost = BigInt(tx.getTotalCost(baseFee));
    if (balance < totalCost) {
      throw new Error(`Insufficient balance: have ${balance.toString()}, need ${totalCost.toString()}`);
    }

    // Check intrinsic gas
    const intrinsicGas = tx.getIntrinsicGas();
    if (tx.gasLimit < intrinsicGas) {
      throw new Error(`Gas limit too low: need at least ${intrinsicGas}, got ${tx.gasLimit}`);
    }

    // Add to mempool
    const result = this.txPool.add(tx);
    if (!result.accepted) {
      throw new Error(result.reason);
    }

    this.txListeners.forEach(cb => cb(tx));
    return tx.getHash();
  }

  // ── Account Queries ────────────────────────────────────────────────────

  async getBalance(address) {
    return this.state.getBalance(address);
  }

  async getAccount(address) {
    return this.state.getAccount(address);
  }

  // ── Transaction Queries ────────────────────────────────────────────────

  async getTransaction(txHash) {
    return this.db.getTransaction(txHash);
  }

  async getTransactionsByAddress(address, limit = 20) {
    return this.db.getTransactionsByAddress(address, limit);
  }

  /**
   * Get transaction receipt.
   */
  async getReceipt(txHash) {
    // Check cache first
    if (this.receiptCache.has(txHash)) {
      const receipt = this.receiptCache.get(txHash);
      return receipt.toJSON ? receipt.toJSON() : receipt;
    }

    // Look up in blocks
    const txData = await this.db.getTransaction(txHash);
    if (!txData) return null;

    // Find the block that contains this tx
    const height = await this.db.getLatestHeight();
    for (let h = height; h >= 0; h--) {
      const blockData = await this.db.getBlock(h);
      if (!blockData) continue;
      const txIndex = (blockData.transactions || []).findIndex(t => t.hash === txHash);
      if (txIndex >= 0 && blockData.receipts && blockData.receipts[txIndex]) {
        return blockData.receipts[txIndex];
      }
    }
    return null;
  }

  /**
   * Universal search — searches by tx hash, block height, or address.
   */
  async search(query) {
    const results = { type: null, data: null };

    // Try as block height
    const heightNum = parseInt(query);
    if (!isNaN(heightNum) && heightNum >= 0) {
      const block = await this.getBlock(heightNum);
      if (block) {
        results.type = 'block';
        results.data = block.toJSON();
        return results;
      }
    }

    // Try as tx hash
    if (query.startsWith('0x') && query.length === 66) {
      const tx = await this.getTransaction(query);
      if (tx) {
        results.type = 'transaction';
        results.data = tx;
        const receipt = await this.getReceipt(query);
        if (receipt) results.receipt = receipt;
        return results;
      }
    }

    // Try as address
    if (query.startsWith('0x') && query.length === 42) {
      const account = await this.getAccount(query);
      const txs = await this.getTransactionsByAddress(query, 20);
      results.type = 'address';
      results.data = {
        address: query,
        balance: account ? account.balance : '0',
        nonce: account ? account.nonce : 0,
        isContract: account ? account.isContract : false,
        transactions: txs || []
      };
      return results;
    }

    return results;
  }

  // ── Gas Estimation ─────────────────────────────────────────────────────

  async estimateGas(tx) {
    let gas = config.GAS_COSTS.TX_BASE;

    // Data cost
    if (tx.data) {
      const dataStr = typeof tx.data === 'string' ? tx.data : JSON.stringify(tx.data);
      const dataBytes = Buffer.from(dataStr);
      for (const byte of dataBytes) {
        gas += byte === 0 ? config.GAS_COSTS.TX_DATA_ZERO : config.GAS_COSTS.TX_DATA_NONZERO;
      }
    }

    // Contract creation
    if (!tx.to || tx.to === '0x' + '0'.repeat(40)) {
      gas += config.GAS_COSTS.CONTRACT_CREATE;
    }

    // Contract call
    if (tx.to) {
      const account = await this.getAccount(tx.to);
      if (account && account.isContract) {
        gas += config.GAS_COSTS.CALL + config.GAS_COSTS.SLOAD * 2;
      }
    }

    // Add 20% buffer
    return Math.ceil(gas * 1.2);
  }

  // ── Network Stats ─────────────────────────────────────────────────────

  async getNetworkStats() {
    const latest = await this.getLatestBlock();
    const height = latest ? latest.header.height : 0;
    const avgBlockTime = this.consensus.getAvgBlockTime();

    // Calculate total supply minus burned
    const totalSupply = BigInt(config.INITIAL_SUPPLY);
    const totalBurned = BigInt(this.stats.totalBurned || '0');
    const circulatingSupply = (totalSupply - totalBurned).toString();

    return {
      height,
      totalTransactions: this.stats.totalTransactions,
      avgBlockTime,
      tps: this.consensus.getTPS(),
      gasPrice: latest ? latest.header.baseFeePerGas : config.BASE_FEE,
      totalSupply: config.INITIAL_SUPPLY,
      circulatingSupply,
      totalBurned: this.stats.totalBurned,
      pendingTransactions: this.txPool.getCount(),
      validators: this.consensus.validators.size,
      activeValidators: [...this.consensus.validators.values()].filter(v => v.isActive).length,
      epoch: this.consensus.getCurrentEpoch(),
      finalizedHeight: this.consensus.finalizedHeight,
      uptime: Math.round((Date.now() - this.stats.startTime) / 1000)
    };
  }

  async getInfo() {
    const latest = await this.getLatestBlock();
    const height = latest ? latest.header.height : 0;
    return {
      chainId: config.CHAIN_ID,
      name: config.CHAIN_NAME,
      chainType: config.CHAIN_TYPE,
      symbol: config.SYMBOL,
      decimals: config.DECIMALS,
      height,
      latestHash: latest ? latest.getHash() : null,
      totalTransactions: this.stats.totalTransactions,
      pendingTransactions: this.txPool.getCount(),
      validators: [...this.consensus.validators.keys()],
      activeValidators: [...this.consensus.validators.entries()].filter(([_, v]) => v.isActive).map(([a]) => a),
      gasPrice: latest ? latest.header.baseFeePerGas : config.BASE_FEE,
      baseFee: latest ? latest.header.baseFeePerGas : config.BASE_FEE,
      blockTime: config.BLOCK_TIME,
      consensus: config.CONSENSUS,
      epoch: this.consensus.getCurrentEpoch(),
      finalizedHeight: this.consensus.finalizedHeight,
      networkVersion: config.NETWORK_VERSION
    };
  }

  // ── Event Listeners ────────────────────────────────────────────────────

  onBlock(callback) {
    this.blockListeners.push(callback);
  }

  onTransaction(callback) {
    this.txListeners.push(callback);
  }

  async close() {
    this.isRunning = false;
    // Save stats
    const chainInfo = await this.db.getChainInfo();
    if (chainInfo) {
      chainInfo.stats = this.stats;
      await this.db.putChainInfo(chainInfo);
    }
    await this.db.close();
  }
}

module.exports = Blockchain;
