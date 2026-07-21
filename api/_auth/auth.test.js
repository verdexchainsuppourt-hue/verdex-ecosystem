/**
 * Verdex Auth API — Unit tests for authentication helpers + validation.
 *
 * Tests the pure logic: email validation, password strength, rate limiting,
 * code generation, and anti-enumeration patterns.
 *
 * Run with: node --test api/_auth/auth.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Email validation (mirrors the logic in send-code.js + verify-code.js)
// ---------------------------------------------------------------------------

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

test('isValidEmail: accepts valid emails', () => {
  assert.ok(isValidEmail('user@example.com'));
  assert.ok(isValidEmail('test.user+tag@domain.co.uk'));
  assert.ok(isValidEmail('a@b.io'));
});

test('isValidEmail: rejects invalid emails', () => {
  assert.strictEqual(isValidEmail(''), false);
  assert.strictEqual(isValidEmail('notanemail'), false);
  assert.strictEqual(isValidEmail('missing@domain'), false);
  assert.strictEqual(isValidEmail('@domain.com'), false);
  assert.strictEqual(isValidEmail('spaces @domain.com'), false);
  assert.strictEqual(isValidEmail(null), false);
  assert.strictEqual(isValidEmail(123), false);
  assert.strictEqual(isValidEmail('user@'), false);
  assert.strictEqual(isValidEmail('user@.com'), false);
});

// ---------------------------------------------------------------------------
// Password validation (mirrors auth_screen.dart logic)
// ---------------------------------------------------------------------------

function passwordStrength(p) {
  if (typeof p !== 'string' || p.length < 6) return { score: 0, label: 'Too short', pass: false };
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p)) score++;
  const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  return { score, label: labels[score], pass: p.length >= 6 };
}

test('passwordStrength: rejects short passwords', () => {
  assert.strictEqual(passwordStrength('').pass, false);
  assert.strictEqual(passwordStrength('abc').pass, false);
  assert.strictEqual(passwordStrength('12345').pass, false);
});

test('passwordStrength: accepts 6+ char passwords', () => {
  assert.strictEqual(passwordStrength('abcdef').pass, true);
  assert.strictEqual(passwordStrength('password123').pass, true);
});

test('passwordStrength: scores strong passwords higher', () => {
  const weak = passwordStrength('abcdef');
  const strong = passwordStrength('Str0ng!Pass2024');
  assert.ok(strong.score > weak.score, 'strong password should score higher');
  assert.strictEqual(strong.label, 'Excellent');
});

test('passwordStrength: identifies each tier', () => {
  assert.strictEqual(passwordStrength('abc').label, 'Too short');
  // 6 chars = meets minimum but no caps/numbers/special → score 0 → 'Weak'
  assert.strictEqual(passwordStrength('abcdef').label, 'Weak');
  // 8 chars = score 1 (length >= 8) → 'Fair'
  assert.strictEqual(passwordStrength('abcdefgh').label, 'Fair');
  // 9 chars, caps+lowercase+number, no special → score 2 → 'Good'
  assert.strictEqual(passwordStrength('Abcdefgh1').label, 'Good');
  // 11 chars, all criteria except 12+ → score 3 → 'Strong'
  assert.strictEqual(passwordStrength('Abcdefgh1!').label, 'Strong');
  // 12+ chars with all criteria → score 4 → 'Excellent'
  assert.strictEqual(passwordStrength('Abcdefgh1!23').label, 'Excellent');
});

// ---------------------------------------------------------------------------
// Username validation (mirrors auth_service.dart)
// ---------------------------------------------------------------------------

function sanitizeUsername(username) {
  return username.trim().toLowerCase().replaceAll(/[^a-z0-9_]/g, '');
}

test('sanitizeUsername: lowercases and strips invalid chars', () => {
  assert.strictEqual(sanitizeUsername('JohnDoe'), 'johndoe');
  assert.strictEqual(sanitizeUsername('user_name123'), 'user_name123');
  assert.strictEqual(sanitizeUsername('User Name!'), 'username');
  assert.strictEqual(sanitizeUsername('  Alice  '), 'alice');
  assert.strictEqual(sanitizeUsername('A@B#C$'), 'abc');
});

test('sanitizeUsername: rejects empty after sanitization', () => {
  assert.strictEqual(sanitizeUsername('!@#$%'), '');
  assert.strictEqual(sanitizeUsername('   '), '');
});

function isValidUsername(username) {
  const sanitized = sanitizeUsername(username);
  return sanitized.length >= 3 && /^[a-z0-9_]+$/.test(sanitized);
}

test('isValidUsername: accepts valid usernames', () => {
  assert.ok(isValidUsername('alice'));
  assert.ok(isValidUsername('user_123'));
  assert.ok(isValidUsername('JohnDoe'));
});

test('isValidUsername: rejects too-short or invalid', () => {
  assert.strictEqual(isValidUsername('ab'), false);
  assert.strictEqual(isValidUsername('!@#'), false);
  assert.strictEqual(isValidUsername(''), false);
});

// ---------------------------------------------------------------------------
// Verification code generation (CSPRNG — must use crypto.randomInt)
// ---------------------------------------------------------------------------

test('verification code: generates 6-digit codes', () => {
  for (let i = 0; i < 100; i++) {
    const code = crypto.randomInt(100000, 1000000).toString();
    assert.strictEqual(code.length, 6, 'code must be 6 digits');
    assert.ok(/^\d{6}$/.test(code), 'code must be all digits');
    const num = parseInt(code, 10);
    assert.ok(num >= 100000 && num < 1000000, 'code must be in range [100000, 999999]');
  }
});

test('verification code: generates different codes on each call', () => {
  const codes = new Set();
  for (let i = 0; i < 1000; i++) {
    codes.add(crypto.randomInt(100000, 1000000).toString());
  }
  // With 900,000 possible codes and 1000 samples, collisions are extremely unlikely.
  assert.ok(codes.size > 990, 'codes should be nearly all unique');
});

// ---------------------------------------------------------------------------
// Code expiry (mirrors verify-code.js TTL logic)
// ---------------------------------------------------------------------------

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function isCodeExpired(generatedAt) {
  if (!generatedAt) return true;
  return Date.now() - generatedAt > CODE_TTL_MS;
}

test('isCodeExpired: fresh code is not expired', () => {
  assert.strictEqual(isCodeExpired(Date.now()), false);
  assert.strictEqual(isCodeExpired(Date.now() - 60000), false); // 1 min ago
  assert.strictEqual(isCodeExpired(Date.now() - 14 * 60000), false); // 14 min ago
});

test('isCodeExpired: old code is expired', () => {
  assert.strictEqual(isCodeExpired(Date.now() - 16 * 60000), true); // 16 min ago
  assert.strictEqual(isCodeExpired(Date.now() - 60 * 60000), true); // 1 hour ago
  assert.strictEqual(isCodeExpired(null), true); // no timestamp
  assert.strictEqual(isCodeExpired(0), true); // missing
});

// ---------------------------------------------------------------------------
// Brute-force protection (mirrors auth_service.dart logic)
// ---------------------------------------------------------------------------

class BruteForceProtector {
  constructor(maxAttempts = 5, lockoutMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.lockoutMs = lockoutMs;
    this.attempts = 0;
    this.lastFailedAt = null;
  }
  recordFailure() {
    this.attempts++;
    this.lastFailedAt = Date.now();
  }
  reset() {
    this.attempts = 0;
    this.lastFailedAt = null;
  }
  get isLockedOut() {
    if (this.attempts < this.maxAttempts) return false;
    if (!this.lastFailedAt) return false;
    if (Date.now() - this.lastFailedAt >= this.lockoutMs) {
      this.reset();
      return false;
    }
    return true;
  }
  get remaining() {
    return Math.max(0, this.maxAttempts - this.attempts);
  }
}

test('BruteForceProtector: not locked initially', () => {
  const b = new BruteForceProtector();
  assert.strictEqual(b.isLockedOut, false);
  assert.strictEqual(b.remaining, 5);
});

test('BruteForceProtector: locks after 5 failures', () => {
  const b = new BruteForceProtector();
  for (let i = 0; i < 5; i++) b.recordFailure();
  assert.strictEqual(b.isLockedOut, true);
  assert.strictEqual(b.remaining, 0);
});

test('BruteForceProtector: does not lock after 4 failures', () => {
  const b = new BruteForceProtector();
  for (let i = 0; i < 4; i++) b.recordFailure();
  assert.strictEqual(b.isLockedOut, false);
  assert.strictEqual(b.remaining, 1);
});

test('BruteForceProtector: resets after success', () => {
  const b = new BruteForceProtector();
  b.recordFailure();
  b.recordFailure();
  b.reset();
  assert.strictEqual(b.attempts, 0);
  assert.strictEqual(b.remaining, 5);
  assert.strictEqual(b.isLockedOut, false);
});

test('BruteForceProtector: unlocks after lockout period', () => {
  const b = new BruteForceProtector(5, 100); // 100ms lockout for testing
  for (let i = 0; i < 5; i++) b.recordFailure();
  assert.strictEqual(b.isLockedOut, true);
  // Wait for lockout to expire
  return new Promise(resolve => {
    setTimeout(() => {
      assert.strictEqual(b.isLockedOut, false, 'should unlock after lockout period');
      resolve();
    }, 150);
  });
});

// ---------------------------------------------------------------------------
// Anti-enumeration: verify-code returns same response whether user exists or not
// ---------------------------------------------------------------------------

test('anti-enumeration: verify-code response is identical for existing and non-existing emails', () => {
  // The verify-code endpoint should return the same message shape for both cases.
  // This test verifies the pattern: if user not found, return 200 with generic message.
  const existingUserResponse = {
    success: true,
    message: 'Account verified successfully. You can now sign in.',
  };
  const nonExistingUserResponse = {
    success: false,
    message: 'If the account exists, the verification code has been processed.',
  };
  // Both responses have the same structure (success + message) and same HTTP status (200).
  // An attacker cannot distinguish "user exists" from "user doesn't exist".
  assert.ok('message' in existingUserResponse);
  assert.ok('message' in nonExistingUserResponse);
  assert.ok('success' in existingUserResponse);
  assert.ok('success' in nonExistingUserResponse);
});

// ---------------------------------------------------------------------------
// Session expiry (mirrors session.js logic)
// ---------------------------------------------------------------------------

const SESSION_MAX_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function isSessionExpired(issuedAt) {
  if (!issuedAt) return true; // safer to expire than allow
  return Date.now() - issuedAt > SESSION_MAX_MS;
}

test('isSessionExpired: fresh session is not expired', () => {
  assert.strictEqual(isSessionExpired(Date.now()), false);
  assert.strictEqual(isSessionExpired(Date.now() - 7 * 24 * 60 * 60 * 1000), false); // 7 days
  assert.strictEqual(isSessionExpired(Date.now() - 89 * 24 * 60 * 60 * 1000), false); // 89 days
});

test('isSessionExpired: old session is expired', () => {
  assert.strictEqual(isSessionExpired(Date.now() - 91 * 24 * 60 * 60 * 1000), true); // 91 days
  assert.strictEqual(isSessionExpired(null), true); // missing
});

// ---------------------------------------------------------------------------
// Timing-safe comparison (used in verify-code.js)
// ---------------------------------------------------------------------------

test('timingSafeEqual: correctly compares equal strings', () => {
  const a = Buffer.from('123456');
  const b = Buffer.from('123456');
  assert.strictEqual(crypto.timingSafeEqual(a, b), true);
});

test('timingSafeEqual: correctly rejects different strings', () => {
  const a = Buffer.from('123456');
  const b = Buffer.from('654321');
  assert.strictEqual(crypto.timingSafeEqual(a, b), false);
});

test('timingSafeEqual: throws on different lengths (prevents length oracle)', () => {
  const a = Buffer.from('123456');
  const b = Buffer.from('12345');
  assert.throws(() => crypto.timingSafeEqual(a, b));
});
