/**
 * Verdex Chain - Validator Slashing
 * Tracks validator behavior, detects double-signing, applies stake penalties,
 * and bans repeat offenders.
 */

const config = require('./config');

// Offense types
const OFFENSE_TYPES = {
  DOUBLE_SIGN: 'double_sign',
  MISSED_BLOCK: 'missed_block',
  EQUIVOCATION: 'equivocation',
  DOWNTIME: 'downtime'
};

// Penalty rates
const PENALTY_RATES = {
  [OFFENSE_TYPES.DOUBLE_SIGN]: 0.10,     // 10% of stake
  [OFFENSE_TYPES.MISSED_BLOCK]: 0.001,   // 0.1% of stake
  [OFFENSE_TYPES.EQUIVOCATION]: 0.15,    // 15% of stake
  [OFFENSE_TYPES.DOWNTIME]: 0.005        // 0.5% of stake
};

const MAX_OFFENSES_BEFORE_BAN = 3;
const JAIL_DURATION_BLOCKS = 500;         // Must wait 500 blocks before unjailing

class SlashingRecord {
  constructor({ validator, offense, evidence, blockHeight, slashedAmount, timestamp }) {
    this.validator = validator;
    this.offense = offense;
    this.evidence = evidence || '';
    this.blockHeight = blockHeight;
    this.slashedAmount = slashedAmount;
    this.timestamp = timestamp || Date.now();
  }

  toJSON() {
    return {
      validator: this.validator,
      offense: this.offense,
      evidence: this.evidence,
      blockHeight: this.blockHeight,
      slashedAmount: this.slashedAmount,
      timestamp: this.timestamp
    };
  }

  static fromJSON(json) {
    return new SlashingRecord(json);
  }
}

class ValidatorScore {
  constructor({ address, blocksProposed = 0, blocksMissed = 0, uptime = 100, offenses = 0, jailedUntil = 0, isBanned = false, score = 100 }) {
    this.address = address;
    this.blocksProposed = blocksProposed;
    this.blocksMissed = blocksMissed;
    this.uptime = uptime;            // 0-100 percentage
    this.offenses = offenses;
    this.jailedUntil = jailedUntil;  // Block height until which validator is jailed
    this.isBanned = isBanned;
    this.score = score;              // 0-100 reputation score
    this.lastProposedAt = 0;
    this.streakConsecutive = 0;
  }

  isJailed(currentHeight) {
    return this.jailedUntil > currentHeight;
  }

  isEligible(currentHeight) {
    return !this.isBanned && !this.isJailed(currentHeight);
  }

  recordProposal(blockHeight) {
    this.blocksProposed++;
    this.lastProposedAt = blockHeight;
    this.streakConsecutive++;
    this._recalcScore();
  }

  recordMiss() {
    this.blocksMissed++;
    this.streakConsecutive = 0;
    this._recalcScore();
  }

  _recalcScore() {
    const totalSlots = this.blocksProposed + this.blocksMissed;
    if (totalSlots === 0) {
      this.score = 100;
      this.uptime = 100;
      return;
    }

    this.uptime = Math.round((this.blocksProposed / totalSlots) * 100 * 100) / 100;

    // Score = uptime_weight * uptime - offense_penalty + streak_bonus
    let score = this.uptime * 0.7;
    score -= this.offenses * 10;
    score += Math.min(this.streakConsecutive * 0.5, 15); // max +15 from streak
    this.score = Math.max(0, Math.min(100, Math.round(score * 100) / 100));
  }

  toJSON() {
    return {
      address: this.address,
      blocksProposed: this.blocksProposed,
      blocksMissed: this.blocksMissed,
      uptime: this.uptime,
      offenses: this.offenses,
      jailedUntil: this.jailedUntil,
      isBanned: this.isBanned,
      score: this.score,
      lastProposedAt: this.lastProposedAt,
      streakConsecutive: this.streakConsecutive
    };
  }

  static fromJSON(json) {
    const vs = new ValidatorScore(json);
    vs.lastProposedAt = json.lastProposedAt || 0;
    vs.streakConsecutive = json.streakConsecutive || 0;
    return vs;
  }
}

class SlashingManager {
  constructor() {
    this.scores = new Map();      // address -> ValidatorScore
    this.records = [];            // SlashingRecord[]
    this.signedBlocks = new Map(); // height -> Set(validatorAddress)
  }

  getOrCreateScore(address) {
    if (!this.scores.has(address)) {
      this.scores.set(address, new ValidatorScore({ address }));
    }
    return this.scores.get(address);
  }

  /**
   * Record that a validator proposed a block at height.
   */
  recordBlockProposal(validatorAddress, blockHeight) {
    const score = this.getOrCreateScore(validatorAddress);
    score.recordProposal(blockHeight);

    // Track for double-sign detection
    if (!this.signedBlocks.has(blockHeight)) {
      this.signedBlocks.set(blockHeight, new Set());
    }
    this.signedBlocks.get(blockHeight).add(validatorAddress);
  }

  /**
   * Record that a validator missed their slot.
   */
  recordMissedBlock(validatorAddress) {
    const score = this.getOrCreateScore(validatorAddress);
    score.recordMiss();
  }

  /**
   * Check if a validator double-signed at a given height.
   * @returns {boolean}
   */
  checkDoubleSigning(validatorAddress, blockHeight) {
    const signers = this.signedBlocks.get(blockHeight);
    if (!signers) return false;
    return signers.has(validatorAddress);
  }

  /**
   * Slash a validator. Returns the amount slashed.
   * @param {string} validatorAddress
   * @param {string} offense - one of OFFENSE_TYPES
   * @param {string} currentStake - validator's current stake
   * @param {number} blockHeight - current block height
   * @param {string} evidence - optional evidence string
   * @returns {{ slashedAmount: string, jailed: boolean, banned: boolean }}
   */
  slash(validatorAddress, offense, currentStake, blockHeight, evidence = '') {
    const score = this.getOrCreateScore(validatorAddress);
    const rate = PENALTY_RATES[offense] || 0.01;
    const slashedAmount = (BigInt(currentStake) * BigInt(Math.floor(rate * 10000)) / 10000n).toString();

    score.offenses++;

    // Record
    this.records.push(new SlashingRecord({
      validator: validatorAddress,
      offense,
      evidence,
      blockHeight,
      slashedAmount
    }));

    let jailed = false;
    let banned = false;

    // Jail for serious offenses
    if (offense === OFFENSE_TYPES.DOUBLE_SIGN || offense === OFFENSE_TYPES.EQUIVOCATION) {
      score.jailedUntil = blockHeight + JAIL_DURATION_BLOCKS;
      jailed = true;
    }

    // Ban after too many offenses
    if (score.offenses >= MAX_OFFENSES_BEFORE_BAN) {
      score.isBanned = true;
      banned = true;
    }

    score._recalcScore();
    return { slashedAmount, jailed, banned };
  }

  /**
   * Unjail a validator (if jail period has expired).
   */
  unjail(validatorAddress, currentHeight) {
    const score = this.getOrCreateScore(validatorAddress);
    if (score.isBanned) {
      throw new Error('Validator is permanently banned');
    }
    if (score.jailedUntil > currentHeight) {
      throw new Error(`Validator is jailed until block ${score.jailedUntil} (current: ${currentHeight})`);
    }
    score.jailedUntil = 0;
    return true;
  }

  /**
   * Get all eligible validators at a given height.
   */
  getEligibleValidators(currentHeight) {
    return [...this.scores.entries()]
      .filter(([_, score]) => score.isEligible(currentHeight))
      .map(([addr, score]) => ({ address: addr, score: score.score }))
      .sort((a, b) => b.score - a.score);
  }

  getSlashingHistory(validatorAddress) {
    return this.records
      .filter(r => r.validator === validatorAddress)
      .map(r => r.toJSON());
  }

  getAllScores() {
    return [...this.scores.values()].map(s => s.toJSON());
  }

  toJSON() {
    return {
      scores: [...this.scores.entries()].map(([addr, s]) => [addr, s.toJSON()]),
      records: this.records.map(r => r.toJSON())
    };
  }

  restore(data) {
    if (!data) return;
    this.scores.clear();
    this.records = [];
    if (data.scores) {
      for (const [addr, s] of data.scores) {
        this.scores.set(addr, ValidatorScore.fromJSON(s));
      }
    }
    if (data.records) {
      this.records = data.records.map(r => SlashingRecord.fromJSON(r));
    }
  }
}

module.exports = {
  SlashingManager,
  SlashingRecord,
  ValidatorScore,
  OFFENSE_TYPES,
  PENALTY_RATES,
  MAX_OFFENSES_BEFORE_BAN,
  JAIL_DURATION_BLOCKS
};
