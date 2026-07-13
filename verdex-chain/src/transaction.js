/**
 * Verdex Chain - Transaction
 * Full transaction model with EIP-1559 fee fields, type field,
 * ECDSA signature components (v, r, s), access lists, and receipt generation.
 */

const crypto = require('./crypto');
const config = require('./config');
const { sha256 } = crypto;

class Transaction {
  constructor({
    type = config.TX_TYPES.LEGACY,
    from,
    to,
    value,
    nonce,
    gasPrice = config.GAS_PRICE,
    gasLimit = 21000,
    maxFeePerGas = null,
    maxPriorityFeePerGas = null,
    data = '',
    signature = null,
    v = null,
    r = null,
    s = null,
    accessList = [],
    contractAddress = null,
    executionResult = null,
    chainId = config.CHAIN_ID,
    blockHeight = undefined,
    isReward = false
  }) {
    this.type = type;
    this.from = from;
    this.to = to;
    this.value = (value || '0').toString();
    this.nonce = nonce;

    // Fee fields — EIP-1559 or legacy
    this.gasPrice = gasPrice ? gasPrice.toString() : config.GAS_PRICE;
    this.gasLimit = gasLimit;
    this.maxFeePerGas = maxFeePerGas ? maxFeePerGas.toString() : null;
    this.maxPriorityFeePerGas = maxPriorityFeePerGas ? maxPriorityFeePerGas.toString() : null;

    this.data = data;
    this.signature = signature;
    this.v = v;
    this.r = r;
    this.s = s;
    this.accessList = accessList;
    this.hash = null;
    this.timestamp = Date.now();
    this.contractAddress = contractAddress;
    this.executionResult = executionResult;
    this.chainId = chainId;
    this.blockHeight = blockHeight;
    this.isReward = isReward;

    // Auto-detect type from fee fields
    if (this.maxFeePerGas && this.type === config.TX_TYPES.LEGACY) {
      this.type = config.TX_TYPES.EIP1559;
    }
  }

  /**
   * Canonical serialization for hashing — excludes signature fields.
   */
  serialize() {
    const base = {
      type: this.type,
      from: this.from,
      to: this.to,
      value: this.value.toString(),
      nonce: this.nonce,
      gasLimit: this.gasLimit,
      data: this.data,
      chainId: this.chainId
    };

    if (this.blockHeight !== undefined && this.blockHeight !== null) {
      base.blockHeight = this.blockHeight;
    }

    if (this.type === config.TX_TYPES.EIP1559 || this.maxFeePerGas) {
      base.maxFeePerGas = (this.maxFeePerGas || this.gasPrice).toString();
      base.maxPriorityFeePerGas = (this.maxPriorityFeePerGas || '0').toString();
    } else {
      base.gasPrice = this.gasPrice.toString();
    }

    if (this.accessList && this.accessList.length > 0) {
      base.accessList = this.accessList;
    }

    return JSON.stringify(base);
  }

  getHash() {
    if (!this.hash) {
      this.hash = '0x' + sha256(this.serialize());
    }
    return this.hash;
  }

  sign(privateKey) {
    this.hash = null; // Reset hash before signing
    const hash = this.getHash();
    const sig = crypto.sign(hash, privateKey);
    this.signature = sig;

    // Extract v, r, s components if signature is hex
    if (typeof sig === 'string' && sig.length >= 128) {
      this.r = '0x' + sig.slice(0, 64);
      this.s = '0x' + sig.slice(64, 128);
      this.v = sig.length > 128 ? parseInt(sig.slice(128), 16) : 27;
    }

    return this;
  }

  verify() {
    if (this.from === '0x' + '0'.repeat(40)) {
      return true; // System transactions are always valid
    }
    if (!this.signature) return false;
    try {
      const currentHash = this.hash;
      this.hash = null; // Reset to recompute
      const hash = this.getHash();
      this.hash = currentHash; // Restore
      
      // Try native recovery first (backward compatibility)
      let recoveredPubKey = crypto.recoverPublicKey(hash, this.signature);
      if (recoveredPubKey) {
        const derivedAddress = crypto.publicKeyToAddress(recoveredPubKey);
        if (derivedAddress.toLowerCase() === this.from.toLowerCase()) {
          return true;
        }
      }
      
      // If native fails, try Ethereum/MetaMask personal_sign recovery
      const recoveredPubKeyEth = crypto.recoverPublicKeyEthereum(hash, this.signature);
      if (recoveredPubKeyEth) {
        const derivedAddressEth = crypto.publicKeyToAddressKeccak(recoveredPubKeyEth);
        if (derivedAddressEth.toLowerCase() === this.from.toLowerCase()) {
          return true;
        }
      }
      
      return false;
    } catch (e) {
      console.error('Transaction verify exception:', e);
      return false;
    }
  }

  /**
   * Calculate the effective gas price given a base fee.
   * For EIP-1559: min(maxFeePerGas, baseFee + maxPriorityFeePerGas)
   * For legacy: gasPrice
   */
  getEffectiveGasPrice(baseFeePerGas) {
    if (this.type === config.TX_TYPES.EIP1559 || this.maxFeePerGas) {
      const baseFee = BigInt(baseFeePerGas || config.BASE_FEE);
      const maxFee = BigInt(this.maxFeePerGas || this.gasPrice);
      const maxPriority = BigInt(this.maxPriorityFeePerGas || '0');
      const effective = baseFee + maxPriority;
      return (effective < maxFee ? effective : maxFee).toString();
    }
    return this.gasPrice.toString();
  }

  /**
   * Calculate the priority fee (tip to validator).
   */
  getPriorityFee(baseFeePerGas) {
    const effectivePrice = BigInt(this.getEffectiveGasPrice(baseFeePerGas));
    const baseFee = BigInt(baseFeePerGas || config.BASE_FEE);
    return (effectivePrice - baseFee).toString();
  }

  /**
   * Calculate total fee.
   */
  getFee() {
    return BigInt(this.gasPrice) * BigInt(this.gasLimit);
  }

  /**
   * Calculate total cost (value + fee).
   */
  getTotalCost(baseFeePerGas) {
    const effectivePrice = BigInt(this.getEffectiveGasPrice(baseFeePerGas));
    return (BigInt(this.value) + effectivePrice * BigInt(this.gasLimit)).toString();
  }

  /**
   * Compute intrinsic gas (minimum gas required for this tx).
   */
  getIntrinsicGas() {
    let gas = config.GAS_COSTS.TX_BASE;

    // Data cost
    if (this.data) {
      const dataBytes = Buffer.from(typeof this.data === 'string' ? this.data : JSON.stringify(this.data));
      for (const byte of dataBytes) {
        gas += byte === 0 ? config.GAS_COSTS.TX_DATA_ZERO : config.GAS_COSTS.TX_DATA_NONZERO;
      }
    }

    // Contract creation cost
    if (!this.to || this.to === '0x' + '0'.repeat(40)) {
      gas += config.GAS_COSTS.CONTRACT_CREATE;
    }

    return gas;
  }

  /**
   * Check if this is a contract creation transaction.
   */
  isContractCreation() {
    return (!this.to || this.to === '0x' + '0'.repeat(40)) && this.data;
  }

  /**
   * Get human-readable type label.
   */
  getTypeLabel() {
    switch (this.type) {
      case config.TX_TYPES.LEGACY: return 'Legacy';
      case config.TX_TYPES.EIP1559: return 'EIP-1559';
      case config.TX_TYPES.STAKING: return 'Staking';
      case config.TX_TYPES.CONTRACT: return 'Contract';
      case config.TX_TYPES.SYSTEM: return 'System';
      default: return 'Unknown';
    }
  }

  toJSON() {
    const json = {
      hash: this.getHash(),
      type: this.type,
      typeLabel: this.getTypeLabel(),
      from: this.from,
      to: this.to,
      value: this.value.toString(),
      nonce: this.nonce,
      gasPrice: this.gasPrice.toString(),
      gasLimit: this.gasLimit,
      maxFeePerGas: this.maxFeePerGas,
      maxPriorityFeePerGas: this.maxPriorityFeePerGas,
      data: this.data,
      signature: this.signature,
      v: this.v,
      r: this.r,
      s: this.s,
      accessList: this.accessList,
      timestamp: this.timestamp,
      contractAddress: this.contractAddress,
      executionResult: this.executionResult,
      chainId: this.chainId
    };

    if (this.blockHeight !== undefined && this.blockHeight !== null) {
      json.blockHeight = this.blockHeight;
    }
    if (this.isReward) {
      json.isReward = true;
    }

    return json;
  }

  static fromJSON(json) {
    const tx = new Transaction({
      type: json.type !== undefined ? json.type : config.TX_TYPES.LEGACY,
      from: json.from,
      to: json.to,
      value: json.value,
      nonce: json.nonce,
      gasPrice: json.gasPrice,
      gasLimit: json.gasLimit,
      maxFeePerGas: json.maxFeePerGas,
      maxPriorityFeePerGas: json.maxPriorityFeePerGas,
      data: json.data,
      signature: json.signature,
      v: json.v,
      r: json.r,
      s: json.s,
      accessList: json.accessList,
      contractAddress: json.contractAddress,
      executionResult: json.executionResult,
      chainId: json.chainId
    });
    tx.timestamp = json.timestamp || tx.timestamp;
    if (json.isReward) tx.isReward = true;
    if (json.blockHeight !== undefined) tx.blockHeight = json.blockHeight;
    return tx;
  }
}

class StakingTransaction extends Transaction {
  constructor({ from, validatorAddress, amount, action, nonce }) {
    super({
      type: config.TX_TYPES.STAKING,
      from,
      to: '0x0000000000000000000000000000000000001000',  // Staking contract
      value: amount,
      nonce,
      gasLimit: 50000,
      data: JSON.stringify({ action, validatorAddress, amount })
    });
    this.action = action;  // 'stake', 'unstake', 'register', 'unjail'
    this.validatorAddress = validatorAddress;
  }
}

class RewardTransaction extends Transaction {
  constructor({ to, value, blockHeight, nonce }) {
    super({
      type: config.TX_TYPES.SYSTEM,
      from: '0x' + '0'.repeat(40),  // System address
      to,
      value,
      nonce,
      gasLimit: 0,
      gasPrice: '0'
    });
    this.blockHeight = blockHeight;
    this.isReward = true;
  }
}

module.exports = { Transaction, StakingTransaction, RewardTransaction };
