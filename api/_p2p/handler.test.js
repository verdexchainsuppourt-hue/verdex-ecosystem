/**
 * Verdex P2P backend — unit tests for the pure helpers exposed by the handler.
 *
 * Uses Node's built-in `node:test` (zero dependencies). Run with:
 *   node --test api/_p2p/handler.test.js
 *
 * These tests cover the security-critical pure logic: atomic-amount math
 * (no float precision loss), input validation, EIP-712 TradeAuthorization
 * signing round-trip (verifying the digest matches VerdexP2PEscrow.sol), and
 * the fail-closed attestation context resolver.
 */
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const { helpers } = require('./handler');
const {
  toAtomic,
  fromAtomic,
  validateUuid,
  validateAtomicAmount,
  validateFiatCurrency,
  validatePaymentMethodCodes,
  signTradeAuthorization,
  addressFromPrivateKey,
  resolveAttestationContext,
  TRADE_STATUS_LABELS,
  VDX_ATOMIC_BASE
} = helpers;

// ---------------------------------------------------------------------------
// toAtomic — human VDX → atomic integer string (no float math, no precision loss)
// ---------------------------------------------------------------------------

test('toAtomic: whole number', () => {
  assert.strictEqual(toAtomic(1), '1000000000000000000');
  assert.strictEqual(toAtomic(0), '0');
  assert.strictEqual(toAtomic(1000), '1000000000000000000000');
});

test('toAtomic: decimal string preserves 18-digit precision', () => {
  assert.strictEqual(toAtomic('0.5'), '500000000000000000');
  assert.strictEqual(toAtomic('1.5'), '1500000000000000000');
  assert.strictEqual(toAtomic('0.000000000000000001'), '1');        // 1 wei
  assert.strictEqual(toAtomic('0.123456789012345678'), '123456789012345678');
});

test('toAtomic: truncates beyond 18 decimals (matches Solidity behavior)', () => {
  assert.strictEqual(toAtomic('1.1234567890123456789'), '1123456789012345678');
});

test('toAtomic: rejects invalid input', () => {
  assert.strictEqual(toAtomic('abc'), null);
  assert.strictEqual(toAtomic('-1'), null);
  assert.strictEqual(toAtomic(''), null);
  assert.strictEqual(toAtomic('1.2.3'), null);
});

test('toAtomic: full VDX supply (1B) round-trips exactly', () => {
  const oneBillion = '1000000000';
  const atomic = toAtomic(oneBillion);
  assert.strictEqual(atomic, '1000000000000000000000000000');
  assert.strictEqual(BigInt(atomic), BigInt(oneBillion) * VDX_ATOMIC_BASE);
});

// ---------------------------------------------------------------------------
// fromAtomic — atomic string → human-readable
// ---------------------------------------------------------------------------

test('fromAtomic: round-trips with toAtomic', () => {
  for (const v of ['0', '1', '0.5', '123.456789', '0.000000000000000001', '1000000000']) {
    const atomic = toAtomic(v);
    const back = fromAtomic(atomic);
    // Parse back to BigInt for exact comparison (string formatting may differ on trailing zeros).
    assert.strictEqual(
      BigInt(toAtomic(back)),
      BigInt(atomic),
      `round-trip failed for ${v}: ${back}`
    );
  }
});

test('fromAtomic: zero', () => {
  assert.strictEqual(fromAtomic('0'), '0');
});

// ---------------------------------------------------------------------------
// validateUuid
// ---------------------------------------------------------------------------

test('validateUuid: accepts valid UUIDs', () => {
  assert.ok(validateUuid('550e8400-e29b-41d4-a716-446655440000'));
  assert.ok(validateUuid(crypto.randomUUID()));
});

test('validateUuid: rejects invalid inputs', () => {
  assert.strictEqual(validateUuid('not-a-uuid'), false);
  assert.strictEqual(validateUuid('550e8400-e29b-41d4-a716'), false);
  assert.strictEqual(validateUuid(''), false);
  assert.strictEqual(validateUuid(null), false);
  assert.strictEqual(validateUuid(123), false);
  assert.strictEqual(validateUuid(undefined), false);
});

// ---------------------------------------------------------------------------
// validateAtomicAmount
// ---------------------------------------------------------------------------

test('validateAtomicAmount: accepts valid positive integer strings', () => {
  assert.ok(validateAtomicAmount('1'));
  assert.ok(validateAtomicAmount('1000000000000000000'));
  assert.ok(validateAtomicAmount('999999999999999999999999999999'));
});

test('validateAtomicAmount: rejects zero, negative, non-numeric, leading zeros', () => {
  assert.strictEqual(validateAtomicAmount('0'), false);
  assert.strictEqual(validateAtomicAmount('-1'), false);
  assert.strictEqual(validateAtomicAmount('01'), false);
  assert.strictEqual(validateAtomicAmount('1.5'), false);
  assert.strictEqual(validateAtomicAmount('abc'), false);
  assert.strictEqual(validateAtomicAmount(''), false);
  assert.strictEqual(validateAtomicAmount(null), false);
});

// ---------------------------------------------------------------------------
// validateFiatCurrency
// ---------------------------------------------------------------------------

test('validateFiatCurrency: accepts ISO-4217 codes', () => {
  assert.ok(validateFiatCurrency('USD'));
  assert.ok(validateFiatCurrency('EUR'));
  assert.ok(validateFiatCurrency('PKR'));
  assert.ok(validateFiatCurrency('NGN'));
});

test('validateFiatCurrency: rejects lowercase, 2-letter, 4-letter, numbers', () => {
  assert.strictEqual(validateFiatCurrency('usd'), false);
  assert.strictEqual(validateFiatCurrency('US'), false);
  assert.strictEqual(validateFiatCurrency('USDD'), false);
  assert.strictEqual(validateFiatCurrency('123'), false);
  assert.strictEqual(validateFiatCurrency(''), false);
});

// ---------------------------------------------------------------------------
// validatePaymentMethodCodes
// ---------------------------------------------------------------------------

test('validatePaymentMethodCodes: accepts 1–10 string codes', () => {
  assert.ok(validatePaymentMethodCodes(['BANK_TRANSFER']));
  assert.ok(validatePaymentMethodCodes(['BANK_TRANSFER', 'WISE', 'PAYPAL']));
  assert.ok(validatePaymentMethodCodes(Array(10).fill('X')));
});

test('validatePaymentMethodCodes: rejects empty, >10, non-string, mixed', () => {
  assert.strictEqual(validatePaymentMethodCodes([]), false);
  assert.strictEqual(validatePaymentMethodCodes(Array(11).fill('X')), false);
  assert.strictEqual(validatePaymentMethodCodes([123]), false);
  assert.strictEqual(validatePaymentMethodCodes(['OK', 123]), false);
  assert.strictEqual(validatePaymentMethodCodes(null), false);
  assert.strictEqual(validatePaymentMethodCodes('BANK_TRANSFER'), false); // not an array
});

// ---------------------------------------------------------------------------
// EIP-712 TradeAuthorization signing round-trip
//
// This is the critical test: it verifies that the digest the handler signs
// is the SAME digest VerdexP2PEscrow.sol computes in
// `tradeAuthorizationDigest()`. If the encoding drifts, the contract will
// reject every escrow with InvalidTradeAuthorization.
// ---------------------------------------------------------------------------

// A known test private key (never used in production — this is the Hardhat
// default signer #0 key, public knowledge).
const TEST_ATTESTOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ESCROW_ADDRESS = '0x5fbdb2315678afecb367f032d93f642f64180aa3';
const TEST_CHAIN_ID = 72010;

test('addressFromPrivateKey: derives the correct EVM address', () => {
  // Hardhat signer #0's address is well-known:
  const addr = addressFromPrivateKey(TEST_ATTESTOR_KEY);
  assert.ok(/^0x[a-f0-9]{40}$/.test(addr), `address format invalid: ${addr}`);
  assert.strictEqual(addr.toLowerCase(), '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
});

test('signTradeAuthorization: produces a 65-byte signature (r+s+v)', () => {
  const tradeReference = '0x' + crypto.randomBytes(32).toString('hex');
  const sig = signTradeAuthorization(
    TEST_ATTESTOR_KEY,
    TEST_ESCROW_ADDRESS,
    TEST_CHAIN_ID,
    '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', // seller
    '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', // buyer
    '1000000000000000000',                          // 1 VDX
    Math.floor(Date.now() / 1000) + 1800,           // paymentDeadline
    tradeReference,
    Math.floor(Date.now() / 1000) + 900             // authDeadline
  );
  assert.ok(sig.startsWith('0x'), 'signature must start with 0x');
  assert.strictEqual(sig.length, 132, 'signature must be 0x + 130 hex chars (65 bytes)'); // 0x + 64+64+2
  assert.ok(/^[0-9a-f]+$/.test(sig.slice(2)), 'signature hex body invalid');
});

test('signTradeAuthorization: recovered address matches the attestor (EIP-712 round-trip)', () => {
  // Recompute the digest exactly as the contract does, then recover the
  // signer from the signature. If it matches addressFromPrivateKey(key),
  // the encoding is correct and the contract will accept it.
  const elliptic = require('elliptic');
  const { keccak256 } = require('js-sha3');
  const ec = new elliptic.ec('secp256k1');

  const seller = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
  const buyer = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
  const amount = '2500000000000000000'; // 2.5 VDX
  const paymentDeadline = 1893456000;
  const tradeReference = '0x' + 'ab'.repeat(32);
  const authDeadline = 1893456000;

  const sig = signTradeAuthorization(
    TEST_ATTESTOR_KEY, TEST_ESCROW_ADDRESS, TEST_CHAIN_ID,
    seller, buyer, amount, paymentDeadline, tradeReference, authDeadline
  );
  const expectedAddress = addressFromPrivateKey(TEST_ATTESTOR_KEY).toLowerCase();

  // Recompute the EIP-712 digest the way the contract does:
  function keccak256Buf(buf) { return Buffer.from(keccak256(buf), 'hex'); }
  function abiEncode(types, values) {
    const parts = [];
    for (let i = 0; i < types.length; i++) {
      let val = values[i];
      if (types[i] === 'address') val = String(val).replace(/^0x/, '').toLowerCase().padStart(64, '0');
      else if (types[i] === 'uint256' || types[i] === 'uint64') val = BigInt(val).toString(16).padStart(64, '0');
      else if (types[i] === 'bytes32') val = String(val).replace(/^0x/, '').toLowerCase().padStart(64, '0');
      parts.push(Buffer.from(val, 'hex'));
    }
    return Buffer.concat(parts);
  }

  const DOMAIN_TYPEHASH = keccak256Buf('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
  const NAME_HASH = keccak256Buf('Verdex P2P Escrow');
  const VERSION_HASH = keccak256Buf('1');
  const domainSeparator = keccak256Buf(Buffer.concat([
    DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH,
    abiEncode(['uint256', 'address'], [TEST_CHAIN_ID, TEST_ESCROW_ADDRESS])
  ]));
  const TRADE_TYPEHASH = keccak256Buf(
    'TradeAuthorization(address seller,address buyer,uint256 amount,uint64 paymentDeadline,bytes32 tradeReference,uint256 authorizationDeadline)'
  );
  const structHash = keccak256Buf(Buffer.concat([
    TRADE_TYPEHASH,
    abiEncode(['address', 'address', 'uint256', 'uint64', 'bytes32', 'uint256'],
      [seller, buyer, amount, paymentDeadline, tradeReference, authDeadline])
  ]));
  const digest = keccak256Buf(Buffer.concat([Buffer.from('1901', 'hex'), domainSeparator, structHash]));

  // Recover the signer from the signature. Note: elliptic's enc='hex' flag
  // produces incorrect results — the digest MUST be passed as a Buffer.
  const r = sig.slice(2, 66);
  const s = sig.slice(66, 130);
  const v = parseInt(sig.slice(130, 132), 16) - 27;
  const pubKey = ec.recoverPubKey(digest, { r, s }, v);
  const pubBytes = Buffer.from(pubKey.encode('array', false));
  const recovered = '0x' + keccak256(pubBytes.slice(1)).slice(-40);

  assert.strictEqual(
    recovered.toLowerCase(),
    expectedAddress,
    'EIP-712 signature does NOT recover to the attestor — contract would reject it!'
  );
});

test('signTradeAuthorization: different tradeReference produces different signature', () => {
  const ref1 = '0x' + 'aa'.repeat(32);
  const ref2 = '0x' + 'bb'.repeat(32);
  const sig1 = signTradeAuthorization(TEST_ATTESTOR_KEY, TEST_ESCROW_ADDRESS, TEST_CHAIN_ID, '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', '1000000000000000000', 1893456000, ref1, 1893456000);
  const sig2 = signTradeAuthorization(TEST_ATTESTOR_KEY, TEST_ESCROW_ADDRESS, TEST_CHAIN_ID, '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', '1000000000000000000', 1893456000, ref2, 1893456000);
  assert.notStrictEqual(sig1, sig2, 'different tradeReferences must produce different signatures (replay protection)');
});

// ---------------------------------------------------------------------------
// resolveAttestationContext — fail-closed behavior
// ---------------------------------------------------------------------------

test('resolveAttestationContext: returns coordination mode when env vars missing', () => {
  // Save and clear all mainnet env vars so we test the fail-closed path.
  const saved = {};
  const keys = ['VERDEX_MAINNET_ENABLED', 'VERDEX_MAINNET_RELEASE_APPROVED', 'VERDEX_MAINNET_CHAIN_ID',
                'VERDEX_MAINNET_GENESIS_HASH', 'VERDEX_MAINNET_PROTOCOL_VERSION', 'VERDEX_MAINNET_ASSET_MODEL',
                'VDX_RPC_URL', 'VERDEX_MAINNET_EXPLORER_URL', 'VDX_ESCROW_CONTRACT_ADDRESS',
                'VDX_ESCROW_RUNTIME_CODE_SHA256', 'VDX_MAINNET_VDX_ADDRESS', 'VDX_MAINNET_VDX_SYMBOL',
                'VDX_MAINNET_VDX_DECIMALS', 'VDX_MAINNET_VDX_RUNTIME_CODE_SHA256',
                'TRADE_ATTESTOR_PRIVATE_KEY'];
  for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }

  const ctx = resolveAttestationContext();
  assert.strictEqual(ctx.ready, false, 'must be NOT ready with no env vars');
  assert.ok(ctx.reason, 'must provide a reason');
  assert.ok(['MAINNET_NOT_VERIFIED', 'ATTESTOR_KEY_NOT_CONFIGURED'].includes(ctx.reason),
    `unexpected reason: ${ctx.reason}`);

  // Restore.
  for (const k of keys) { if (saved[k] !== undefined) process.env[k] = saved[k]; }
});

test('resolveAttestationContext: rejects placeholder/garbage private keys', () => {
  // Set up valid-looking mainnet config but a GARBAGE attestor key.
  const saved = {};
  const realKeys = {
    VERDEX_MAINNET_ENABLED: 'true',
    VERDEX_MAINNET_RELEASE_APPROVED: 'true',
    VERDEX_MAINNET_CHAIN_ID: '72010',
    VERDEX_MAINNET_GENESIS_HASH: '0x' + 'a'.repeat(64),
    VERDEX_MAINNET_PROTOCOL_VERSION: '1.0.0',
    VERDEX_MAINNET_ASSET_MODEL: 'prc20',
    VDX_RPC_URL: 'https://rpc.example.com',
    VERDEX_MAINNET_EXPLORER_URL: 'https://explorer.example.com',
    VDX_ESCROW_CONTRACT_ADDRESS: '0x' + '1'.repeat(40),
    VDX_ESCROW_RUNTIME_CODE_SHA256: 'b'.repeat(64),
    VDX_MAINNET_VDX_ADDRESS: '0x' + '2'.repeat(40),
    VDX_MAINNET_VDX_SYMBOL: 'VDX',
    VDX_MAINNET_VDX_DECIMALS: '18',
    VDX_MAINNET_VDX_RUNTIME_CODE_SHA256: 'c'.repeat(64)
  };
  for (const [k, v] of Object.entries(realKeys)) { saved[k] = process.env[k]; process.env[k] = v; }
  saved.TRADE_ATTESTOR_PRIVATE_KEY = process.env.TRADE_ATTESTOR_PRIVATE_KEY;

  // Garbage key → must fail closed.
  process.env.TRADE_ATTESTOR_PRIVATE_KEY = 'not-a-key';
  let ctx = resolveAttestationContext();
  assert.strictEqual(ctx.ready, false);
  assert.strictEqual(ctx.reason, 'ATTESTOR_KEY_NOT_CONFIGURED');

  // The OLD hardcoded sandbox placeholder must ALSO be rejected.
  process.env.TRADE_ATTESTOR_PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  ctx = resolveAttestationContext();
  assert.strictEqual(ctx.ready, false, 'the old hardcoded sandbox key must NOT pass');
  assert.strictEqual(ctx.reason, 'ATTESTOR_KEY_COMPROMISED');

  // A valid-format key must pass.
  process.env.TRADE_ATTESTOR_PRIVATE_KEY = TEST_ATTESTOR_KEY;
  ctx = resolveAttestationContext();
  assert.strictEqual(ctx.ready, true, 'valid 0x+64hex key must pass');
  assert.ok(ctx.attestorAddress, 'must derive attestor address');
  assert.strictEqual(ctx.escrowAddress, '0x' + '1'.repeat(40));
  assert.strictEqual(ctx.chainId, 72010);

  // Restore.
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ---------------------------------------------------------------------------
// TRADE_STATUS_LABELS — covers every status the user's spec requires
// ---------------------------------------------------------------------------

test('TRADE_STATUS_LABELS: covers every user-facing status from the spec', () => {
  const required = [
    'initiated', 'awaiting_escrow', 'escrow_locked', 'payment_marked_sent',
    'payment_confirmed', 'released', 'cancelled', 'disputed'
  ];
  for (const status of required) {
    assert.ok(TRADE_STATUS_LABELS[status], `missing label for status: ${status}`);
  }
  assert.strictEqual(TRADE_STATUS_LABELS.initiated, 'Pending');
  assert.strictEqual(TRADE_STATUS_LABELS.awaiting_escrow, 'Waiting for Seller');
  assert.strictEqual(TRADE_STATUS_LABELS.escrow_locked, 'Escrow Locked');
  assert.strictEqual(TRADE_STATUS_LABELS.payment_marked_sent, 'Payment Sent');
  assert.strictEqual(TRADE_STATUS_LABELS.payment_confirmed, 'Payment Confirmed');
  assert.strictEqual(TRADE_STATUS_LABELS.released, 'Completed');
  assert.strictEqual(TRADE_STATUS_LABELS.cancelled, 'Cancelled');
  assert.strictEqual(TRADE_STATUS_LABELS.disputed, 'Disputed');
});
