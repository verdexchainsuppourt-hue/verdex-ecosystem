/**
 * Verdex Custodial Wallet — Crypto module tests.
 *
 * Verifies: seed encryption/decryption round-trip, deterministic key
 * derivation (same seed + index = same address), address format validity,
 * and that the master key is never exposed.
 *
 * Run with: node --test api/_wallet/crypto.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const walletCrypto = require('./crypto');

// ---------------------------------------------------------------------------
// Seed encryption / decryption
// ---------------------------------------------------------------------------

test('encryptSeed / decryptSeed round-trip', () => {
  // Set a test master key.
  process.env.WALLET_MASTER_KEY = crypto.randomBytes(32).toString('base64');
  const seed = crypto.randomBytes(32);
  const { encrypted, iv, authTag, keyHash } = walletCrypto.encryptSeed(seed);
  const decrypted = walletCrypto.decryptSeed(encrypted, iv, authTag);
  assert.deepStrictEqual(decrypted, seed, 'decrypted seed must match original');
  assert.ok(keyHash.length === 64, 'keyHash must be SHA-256 hex');
});

test('decryptSeed with wrong master key fails (auth tag mismatch)', () => {
  process.env.WALLET_MASTER_KEY = crypto.randomBytes(32).toString('base64');
  const seed = crypto.randomBytes(32);
  const { encrypted, iv, authTag } = walletCrypto.encryptSeed(seed);
  // Change the master key.
  process.env.WALLET_MASTER_KEY = crypto.randomBytes(32).toString('base64');
  assert.throws(() => walletCrypto.decryptSeed(encrypted, iv, authTag),
    /Unsupported state or unable to authenticate data/,
    'decryption with wrong key must fail');
});

test('getMasterKey accepts base64, hex, and passphrase formats', () => {
  const key1 = crypto.randomBytes(32);
  process.env.WALLET_MASTER_KEY = key1.toString('base64');
  const mk1 = walletCrypto.getMasterKey();
  assert.deepStrictEqual(mk1, key1, 'base64 key must match');

  process.env.WALLET_MASTER_KEY = key1.toString('hex');
  const mk2 = walletCrypto.getMasterKey();
  assert.deepStrictEqual(mk2, key1, 'hex key must match');

  process.env.WALLET_MASTER_KEY = 'my-secret-passphrase-2026';
  const mk3 = walletCrypto.getMasterKey();
  assert.strictEqual(mk3.length, 32, 'passphrase-derived key must be 32 bytes');
});

test('getMasterKey throws when env var missing', () => {
  delete process.env.WALLET_MASTER_KEY;
  assert.throws(() => walletCrypto.getMasterKey(), /WALLET_MASTER_KEY/);
});

// ---------------------------------------------------------------------------
// Deterministic key derivation
// ---------------------------------------------------------------------------

test('derivePrivateKey is deterministic: same seed + index = same key', () => {
  process.env.WALLET_MASTER_KEY = crypto.randomBytes(32).toString('base64');
  const seed = crypto.randomBytes(32);
  const key1 = walletCrypto.derivePrivateKey(seed, 0);
  const key2 = walletCrypto.derivePrivateKey(seed, 0);
  assert.deepStrictEqual(key1, key2, 'same seed + index must produce same key');
});

test('derivePrivateKey produces different keys for different indices', () => {
  const seed = crypto.randomBytes(32);
  const key0 = walletCrypto.derivePrivateKey(seed, 0);
  const key1 = walletCrypto.derivePrivateKey(seed, 1);
  const key2 = walletCrypto.derivePrivateKey(seed, 2);
  assert.notDeepStrictEqual(key0, key1, 'index 0 and 1 must differ');
  assert.notDeepStrictEqual(key1, key2, 'index 1 and 2 must differ');
  assert.notDeepStrictEqual(key0, key2, 'index 0 and 2 must differ');
});

test('derivePrivateKey produces different keys for different seeds', () => {
  const seed1 = crypto.randomBytes(32);
  const seed2 = crypto.randomBytes(32);
  const key1 = walletCrypto.derivePrivateKey(seed1, 0);
  const key2 = walletCrypto.derivePrivateKey(seed2, 0);
  assert.notDeepStrictEqual(key1, key2, 'different seeds must produce different keys');
});

test('derivePrivateKey throws on invalid inputs', () => {
  const seed = crypto.randomBytes(32);
  assert.throws(() => walletCrypto.derivePrivateKey(seed, -1), /Invalid derivation index/);
  assert.throws(() => walletCrypto.derivePrivateKey(seed, 1.5), /Invalid derivation index/);
  assert.throws(() => walletCrypto.derivePrivateKey(null, 0), /Invalid seed/);
  assert.throws(() => walletCrypto.derivePrivateKey(Buffer.alloc(8), 0), /Invalid seed/);
});

// ---------------------------------------------------------------------------
// Address derivation
// ---------------------------------------------------------------------------

test('deriveAddress produces a valid EVM address', () => {
  const seed = crypto.randomBytes(32);
  const addr = walletCrypto.deriveAddress(seed, 0);
  assert.ok(/^0x[a-f0-9]{40}$/.test(addr), `address format invalid: ${addr}`);
});

test('deriveAddress is deterministic', () => {
  const seed = crypto.randomBytes(32);
  const addr1 = walletCrypto.deriveAddress(seed, 42);
  const addr2 = walletCrypto.deriveAddress(seed, 42);
  assert.strictEqual(addr1, addr2, 'same seed + index must produce same address');
});

test('deriveAddress produces different addresses for different indices', () => {
  const seed = crypto.randomBytes(32);
  const addresses = new Set();
  for (let i = 0; i < 100; i++) {
    addresses.add(walletCrypto.deriveAddress(seed, i));
  }
  assert.strictEqual(addresses.size, 100, 'all 100 addresses must be unique');
});

test('addressFromPrivateKey matches known test vector', () => {
  // Hardhat default signer #0 private key → known address.
  const privKey = Buffer.from('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', 'hex');
  const addr = walletCrypto.addressFromPrivateKey(privKey);
  assert.strictEqual(addr.toLowerCase(), '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
});

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

test('isValidAddress accepts valid addresses', () => {
  assert.ok(walletCrypto.isValidAddress('0x' + 'a'.repeat(40)));
  assert.ok(walletCrypto.isValidAddress('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'));
});

test('isValidAddress rejects invalid addresses', () => {
  assert.strictEqual(walletCrypto.isValidAddress('0x123'), false);
  assert.strictEqual(walletCrypto.isValidAddress('f39fd6e51aad88f6f4ce6ab8827279cfffb92266'), false);
  assert.strictEqual(walletCrypto.isValidAddress('0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'), false);
  assert.strictEqual(walletCrypto.isValidAddress(null), false);
  assert.strictEqual(walletCrypto.isValidAddress(123), false);
});

// ---------------------------------------------------------------------------
// Secure memory cleanup
// ---------------------------------------------------------------------------

test('zeroBuffer fills buffer with zeros', () => {
  const buf = Buffer.from('sensitive-key-data-here');
  walletCrypto.zeroBuffer(buf);
  assert.deepStrictEqual(buf, Buffer.alloc(buf.length), 'buffer must be all zeros');
});

// ---------------------------------------------------------------------------
// Atomic amount helpers (from handler.js helpers)
// ---------------------------------------------------------------------------

test('toAtomic converts VDX to atomic correctly', () => {
  const { helpers } = require('./handler');
  assert.strictEqual(helpers.toAtomic(1), '1000000000000000000');
  assert.strictEqual(helpers.toAtomic('0.5'), '500000000000000000');
  assert.strictEqual(helpers.toAtomic('0.000000000000000001'), '1');
  assert.strictEqual(helpers.toAtomic('abc'), null);
  assert.strictEqual(helpers.toAtomic('-1'), null);
});

test('fromAtomic converts atomic to VDX correctly', () => {
  const { helpers } = require('./handler');
  assert.strictEqual(helpers.fromAtomic('0'), '0');
  assert.strictEqual(helpers.fromAtomic('1000000000000000000'), '1');
  assert.strictEqual(helpers.fromAtomic('500000000000000000'), '0.5');
});

test('validateUuid and validateAtomic work correctly', () => {
  const { helpers } = require('./handler');
  assert.ok(helpers.validateUuid('550e8400-e29b-41d4-a716-446655440000'));
  assert.strictEqual(helpers.validateUuid('not-a-uuid'), false);
  assert.ok(helpers.validateAtomic('1000000000000000000'));
  assert.strictEqual(helpers.validateAtomic('0'), false);
  assert.strictEqual(helpers.validateAtomic('-1'), false);
});
