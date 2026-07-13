const { Level } = require('level');
const path = require('path');
const fs = require('fs');
const config = require('./config');

class ChainDB {
  constructor(dataDir) {
    this.dataDir = dataDir || config.DATA_DIR;
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.db = new Level(this.dataDir, { valueEncoding: 'json' });
    this._ready = false;
  }

  async init() {
    await this.db.open();
    this._ready = true;
  }

  async close() {
    await this.db.close();
  }

  // Block storage: key = 'block:{height}', value = block JSON
  async putBlock(height, blockJson) {
    await this.db.put(`block:${height}`, blockJson);
    const hash = blockJson.header.hash;
    await this.db.put(`hash:${height}`, hash);
    await this.db.put(`height:${hash}`, height);
  }

  async getBlock(height) {
    try {
      return await this.db.get(`block:${height}`);
    } catch {
      return null;
    }
  }

  async getBlockByHash(hash) {
    try {
      const height = await this.db.get(`height:${hash}`);
      return this.getBlock(height);
    } catch {
      return null;
    }
  }

  async getLatestHeight() {
    try {
      return await this.db.get('latest_height');
    } catch {
      return -1;
    }
  }

  async setLatestHeight(height) {
    await this.db.put('latest_height', height);
  }

  async getLatestBlock() {
    const height = await this.getLatestHeight();
    if (height === -1) return null;
    return this.getBlock(height);
  }

  // Transaction storage
  async putTransaction(txHash, txJson, blockHeight) {
    await this.db.put(`tx:${txHash}`, { ...txJson, blockHeight });
    // Index by address
    if (txJson.from) {
      const fromKey = `addr_tx:${txJson.from}`;
      try {
        const existing = await this.db.get(fromKey) || [];
        existing.push({ txHash, blockHeight, timestamp: txJson.timestamp });
        await this.db.put(fromKey, existing.slice(-100)); // Keep last 100
      } catch {
        await this.db.put(fromKey, [{ txHash, blockHeight, timestamp: txJson.timestamp }]);
      }
    }
  }

  async getTransaction(txHash) {
    try {
      return await this.db.get(`tx:${txHash}`);
    } catch {
      return null;
    }
  }

  async getTransactionsByAddress(address, limit = 20) {
    try {
      const txs = await this.db.get(`addr_tx:${address}`) || [];
      return txs.slice(-limit).reverse();
    } catch {
      return [];
    }
  }

  // Account state snapshots
  async putState(height, stateJson) {
    await this.db.put(`state:${height}`, stateJson);
  }

  async getState(height) {
    try {
      return await this.db.get(`state:${height}`);
    } catch {
      return null;
    }
  }

  // Validator set
  async putValidators(validators) {
    await this.db.put('validators', validators);
  }

  async getValidators() {
    try {
      return await this.db.get('validators');
    } catch {
      return config.GENESIS_VALIDATORS;
    }
  }

  // Chain info
  async getChainInfo() {
    try {
      return await this.db.get('chain_info');
    } catch {
      return null;
    }
  }

  async putChainInfo(info) {
    await this.db.put('chain_info', info);
  }
}

module.exports = ChainDB;
