/**
 * Verdex Chain - State DB
 * Account state management with fee burning, receipt storage,
 * and enhanced contract execution support.
 */

const crypto = require('./crypto');
const config = require('./config');

class Account {
  constructor({ address, balance = '0', nonce = 0, code = '', storage = {}, isContract = false, createdAt = 0 }) {
    this.address = address;
    this.balance = balance;
    this.nonce = nonce;
    this.code = code;
    this.storage = storage;
    this.isContract = isContract;
    this.createdAt = createdAt || Date.now();
  }

  getBalanceBigInt() {
    return BigInt(this.balance);
  }

  addBalance(amount) {
    this.balance = (BigInt(this.balance) + BigInt(amount)).toString();
  }

  subtractBalance(amount) {
    const current = BigInt(this.balance);
    const amt = BigInt(amount);
    if (current < amt) throw new Error('Insufficient balance');
    this.balance = (current - amt).toString();
  }

  incrementNonce() {
    this.nonce++;
  }

  toJSON() {
    return {
      address: this.address,
      balance: this.balance.toString(),
      nonce: this.nonce,
      code: this.code,
      storage: this.storage,
      isContract: this.isContract,
      createdAt: this.createdAt
    };
  }

  static fromJSON(json) {
    return new Account(json);
  }
}

class StateDB {
  constructor() {
    this.accounts = new Map();
    this.pendingBalances = new Map();
    this._dirty = new Set();
    this.totalBurned = 0n;
  }

  getOrCreateAccount(address) {
    if (!this.accounts.has(address)) {
      this.accounts.set(address, new Account({ address }));
    }
    return this.accounts.get(address);
  }

  getAccount(address) {
    return this.accounts.get(address) || null;
  }

  getBalance(address) {
    const acc = this.getAccount(address);
    return acc ? acc.balance : '0';
  }

  getNonce(address) {
    const acc = this.getAccount(address);
    return acc ? acc.nonce : 0;
  }

  transfer(from, to, amount) {
    const fromAcc = this.getOrCreateAccount(from);
    const toAcc = this.getOrCreateAccount(to);
    fromAcc.subtractBalance(amount);
    toAcc.addBalance(amount);
    this._dirty.add(from);
    this._dirty.add(to);
  }

  mint(address, amount) {
    const acc = this.getOrCreateAccount(address);
    acc.addBalance(amount);
    this._dirty.add(address);
  }

  /**
   * Burn fees — send to burn address.
   */
  burn(amount) {
    const burnAcc = this.getOrCreateAccount(config.BURN_ADDRESS);
    burnAcc.addBalance(amount);
    this.totalBurned += BigInt(amount);
    this._dirty.add(config.BURN_ADDRESS);
  }

  /**
   * Get total burned amount.
   */
  getTotalBurned() {
    const burnAcc = this.getAccount(config.BURN_ADDRESS);
    return burnAcc ? burnAcc.balance : '0';
  }

  /**
   * Get total number of accounts.
   */
  getAccountCount() {
    return this.accounts.size;
  }

  /**
   * Get all accounts (for stats).
   */
  getAllAccounts() {
    return [...this.accounts.values()].map(a => a.toJSON());
  }

  applyTransaction(tx) {
    if (tx.isReward) {
      this.mint(tx.to, tx.value);
      return;
    }

    if (tx.from === '0x' + '0'.repeat(40)) {
      this.mint(tx.to, tx.value);
      return;
    }

    const fromAcc = this.getOrCreateAccount(tx.from);
    if (fromAcc.nonce !== tx.nonce) {
      throw new Error(`Invalid nonce: expected ${fromAcc.nonce}, got ${tx.nonce}`);
    }

    // Calculate effective fee
    const gasPrice = BigInt(tx.gasPrice || config.GAS_PRICE);
    const fee = gasPrice * BigInt(tx.gasLimit);
    const totalCost = BigInt(tx.value) + fee;

    if (BigInt(fromAcc.balance) < totalCost) {
      throw new Error('Insufficient balance for transaction + fee');
    }

    fromAcc.subtractBalance(totalCost.toString());
    fromAcc.incrementNonce();
    this._dirty.add(tx.from);

    // Is this a contract deployment?
    const isDeploy = (!tx.to || tx.to === '0x' + '0'.repeat(40)) && tx.data;

    if (isDeploy) {
      const contractAddress = '0x' + crypto.sha256(tx.from + tx.nonce).slice(-40);
      const contractAcc = new Account({
        address: contractAddress,
        balance: tx.value,
        isContract: true,
        code: tx.data,
        storage: {},
        createdAt: Date.now()
      });
      this.accounts.set(contractAddress, contractAcc);
      this._dirty.add(contractAddress);

      const ContractVM = require('./vm');
      const vm = new ContractVM();
      const res = vm.execute(tx.data, 'deploy', [], {
        sender: tx.from,
        value: tx.value,
        balance: tx.value,
        storage: {}
      });

      if (!res.success) {
        throw new Error(`Contract deployment failed: ${res.error}`);
      }
      contractAcc.storage = res.storage;

      if (res.logs && res.logs.length > 0) {
        console.log(`[VM Log - Deploy ${contractAddress}]:`, res.logs.join(' | '));
      }

      tx.contractAddress = contractAddress;

    } else if (tx.to && tx.to !== '0x' + '0'.repeat(40)) {
      const toAcc = this.getOrCreateAccount(tx.to);

      if (toAcc.isContract) {
        // Credit the sent value
        toAcc.addBalance(tx.value);
        this._dirty.add(tx.to);

        let methodName = tx.data;
        let args = [];
        try {
          const parsed = JSON.parse(tx.data);
          if (parsed.method) {
            methodName = parsed.method;
            args = parsed.args || [];
          }
        } catch {}

        const ContractVM = require('./vm');
        const vm = new ContractVM();
        const res = vm.execute(toAcc.code, methodName, args, {
          sender: tx.from,
          value: tx.value,
          balance: toAcc.balance,
          storage: toAcc.storage
        });

        if (!res.success) {
          throw new Error(`Contract execution reverted: ${res.error}`);
        }

        toAcc.storage = res.storage;

        if (res.logs && res.logs.length > 0) {
          console.log(`[VM Log - Call ${tx.to}]:`, res.logs.join(' | '));
        }

        // Apply internal transfers
        for (const transfer of res.transfers) {
          this.transfer(tx.to, transfer.to, transfer.value);
        }

        tx.executionResult = res.result;
      } else {
        toAcc.addBalance(tx.value);
        this._dirty.add(tx.to);
      }
    }
  }

  getStateRoot() {
    const sorted = [...this.accounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const combined = sorted.map(([addr, acc]) => addr + acc.balance + acc.nonce).join('');
    return '0x' + crypto.doubleSha256(combined || 'empty');
  }

  snapshot() {
    const data = {};
    for (const [addr, acc] of this.accounts) {
      data[addr] = acc.toJSON();
    }
    return data;
  }

  restore(snapshot) {
    this.accounts.clear();
    for (const [addr, data] of Object.entries(snapshot)) {
      this.accounts.set(addr, Account.fromJSON(data));
    }
  }

  toJSON() {
    return this.snapshot();
  }
}

module.exports = { Account, StateDB };
