/**
 * Verdex Custodial Wallet — Cryptographic Core
 *
 * Key management principles:
 *  1. The HD master seed is encrypted with AES-256-GCM and stored in the DB.
 *  2. The encryption key (WALLET_MASTER_KEY) lives ONLY in the deployment env.
 *  3. Per-user private keys are DETERMINISTICALLY DERIVED from the master seed
 *     + the user's derivation index — never stored, never persisted.
 *  4. Keys exist in memory only for the minimum time needed to sign, then
 *     are zeroed.
 *  5. Key versioning supports rotation without changing existing addresses.
 *
 * Derivation: HMAC-SHA256(seed, "verdex-wallet:" + index) → 32-byte private key.
 * This is a simplified KDF (not full BIP-32) that is secure, deterministic,
 * and requires no external dependencies beyond what the project already uses.
 */
const crypto = require('crypto');
const elliptic = require('elliptic');
const { keccak256 } = require('js-sha3');

const ec = new elliptic.ec('secp256k1');
const ALGO = 'aes-256-gcm';

// ---------------------------------------------------------------------------
// Master key resolution from environment
// ---------------------------------------------------------------------------

/**
 * Get the wallet master key from the environment. Must be a 32-byte value
 * encoded as base64 or hex. Throws if missing — NEVER falls back to a default.
 */
function getMasterKey() {
  const raw = process.env.WALLET_MASTER_KEY;
  if (!raw) throw new Error('WALLET_MASTER_KEY environment variable is not set');
  // Accept base64 (44 chars ending with =) or hex (64 chars).
  let key;
  if (/^[A-Za-z0-9+/]{43}=$/.test(raw)) {
    key = Buffer.from(raw, 'base64');
  } else if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    // Use SHA-256 of the input as the key (supports arbitrary-length passphrases).
    key = crypto.createHash('sha256').update(raw).digest();
  }
  if (key.length !== 32) throw new Error('WALLET_MASTER_KEY must derive to 32 bytes');
  return key;
}

// ---------------------------------------------------------------------------
// Seed encryption / decryption (AES-256-GCM)
// ---------------------------------------------------------------------------

/**
 * Encrypt the HD master seed with the master key.
 * @param {Buffer} seed — 32 or 64-byte master seed
 * @returns {{ encrypted: Buffer, iv: Buffer, authTag: Buffer, keyHash: string }}
 */
function encryptSeed(seed) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce for GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(seed), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  return { encrypted, iv, authTag, keyHash };
}

/**
 * Decrypt the HD master seed.
 * @param {Buffer} encrypted
 * @param {Buffer} iv
 * @param {Buffer} authTag
 * @returns {Buffer} plaintext seed
 */
function decryptSeed(encrypted, iv, authTag) {
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Generate a new random 32-byte master seed.
 * @returns {Buffer}
 */
function generateSeed() {
  return crypto.randomBytes(32);
}

// ---------------------------------------------------------------------------
// Deterministic key derivation
// ---------------------------------------------------------------------------

/**
 * Derive a secp256k1 private key from the master seed + derivation index.
 *
 * Uses HMAC-SHA256 as a KDF: privateKey = HMAC(seed, "verdex-wallet:" + index)
 * This is deterministic: the same seed + index always produces the same key.
 * The key is NEVER persisted — it exists in memory only for signing.
 *
 * @param {Buffer} seed — master seed (decrypted)
 * @param {number} derivationIndex — wallet's derivation index from the DB
 * @returns {Buffer} 32-byte private key
 */
function derivePrivateKey(seed, derivationIndex) {
  if (!seed || seed.length < 16) throw new Error('Invalid seed');
  if (!Number.isInteger(derivationIndex) || derivationIndex < 0) {
    throw new Error('Invalid derivation index');
  }
  const info = Buffer.from(`verdex-wallet:${derivationIndex}`, 'utf8');
  return crypto.createHmac('sha256', seed).update(info).digest();
}

/**
 * Derive the EVM address for a given seed + derivation index.
 * @param {Buffer} seed
 * @param {number} derivationIndex
 * @returns {string} 0x-prefixed lowercase address
 */
function deriveAddress(seed, derivationIndex) {
  const privKey = derivePrivateKey(seed, derivationIndex);
  return addressFromPrivateKey(privKey);
}

/**
 * Derive the EVM address from a 32-byte private key.
 * @param {Buffer} privateKey
 * @returns {string} 0x + 40 hex chars
 */
function addressFromPrivateKey(privateKey) {
  const key = ec.keyFromPrivate(privateKey);
  const pub = key.getPublic('hex'); // 04 + X(64) + Y(64)
  const pubBytes = Buffer.from(pub.slice(2), 'hex'); // drop 04 prefix → 64 bytes
  const addressHash = Buffer.from(keccak256(pubBytes), 'hex');
  return '0x' + addressHash.slice(12).toString('hex'); // last 20 bytes
}

/**
 * Validate an EVM address.
 * @param {string} addr
 * @returns {boolean}
 */
function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

/**
 * Check if an address is a known prohibited address (sanctions, scam, etc.).
 * In production this would call an external AML provider; here we check
 * an internal blocklist supplemented by env-configured entries.
 */
function isBlocklistedAddress(addr, supabase) {
  // Implemented in handler.js with DB lookup — this is a stub for the crypto module.
  return false;
}

// ---------------------------------------------------------------------------
// Secure memory cleanup
// ---------------------------------------------------------------------------

/**
 * Zero out a Buffer containing sensitive key material.
 * @param {Buffer} buf
 */
function zeroBuffer(buf) {
  if (buf && buf.fill) {
    buf.fill(0);
  }
}

module.exports = {
  getMasterKey,
  encryptSeed,
  decryptSeed,
  generateSeed,
  derivePrivateKey,
  deriveAddress,
  addressFromPrivateKey,
  isValidAddress,
  zeroBuffer,
  ec, // Export for signing operations
};
