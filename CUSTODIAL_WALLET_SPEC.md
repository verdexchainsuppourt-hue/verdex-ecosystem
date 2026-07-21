# Verdex Custodial Wallet Subsystem — Technical Specification

**Version:** 1.0.0  
**Date:** 2026-07-20  
**Status:** Production-ready (coordination mode until mainnet RPC verification)

## Overview

The Verdex Custodial Wallet is a platform-managed wallet system where the
platform holds encrypted private keys, detects on-chain deposits, processes
withdrawals with KYC/AML hooks and multi-sig treasury approval, and supports
instant off-chain internal transfers between users.

**Key principle:** Private keys are NEVER stored in plaintext, NEVER returned
in any API response, and NEVER sent to the client device. Keys exist in
server memory only for the minimum time needed to sign a transaction.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Flutter Mobile App                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Custodial    │  │ Withdraw     │  │ Internal         │  │
│  │ Balance+QR   │  │ Dialog       │  │ Transfer Dialog  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼──────────────────┼──────────────────┼────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    REST API (Vercel)                          │
│  /api/wallet?action=custodial-balance                         │
│  /api/wallet?action=custodial-deposit-address                 │
│  /api/wallet?action=custodial-withdraw (POST)                 │
│  /api/wallet?action=custodial-transfer (POST)                 │
│  /api/wallet?action=custodial-history                         │
│  /api/wallet?action=admin-pending-withdrawals                 │
│  /api/wallet?action=admin-sign-withdrawal (POST)              │
│  /api/wallet?action=admin-health                              │
│  /api/wallet?action=admin-balances                            │
└─────────┬────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Postgres (RLS + RPCs)                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────────────────┐  │
│  │ Wallets    │ │ Balances   │ │ Treasury Signers       │  │
│  │ (address,  │ │ (available,│ │ (multi-sig roles)      │  │
│  │  deriv idx)│ │  pending,  │ └────────────────────────┘  │
│  │            │ │  locked)   │ ┌────────────────────────┐  │
│  └────────────┘ └────────────┘ │ AML Screenings         │  │
│  ┌────────────┐ ┌────────────┐ │ Deposits/Withdrawals   │  │
│  │ Key Store  │ │ Transfers  │ │ Transactions (history) │  │
│  │ (encrypted │ │ (internal) │ └────────────────────────┘  │
│  │  seed)     │ └────────────┘                               │
│  └────────────┘                                               │
└─────────┬────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│           Deposit Detection Worker (Cron, every 5 min)       │
│  Polls RPC → updates confirmations → credits balances        │
└─────────────────────────────────────────────────────────────┘
```

## Key Management

### Master Seed
- Generated once via `crypto.randomBytes(32)`
- Encrypted with AES-256-GCM using `WALLET_MASTER_KEY` env var
- Stored encrypted in `verdex_custodial_key_store` (singleton table)
- Key versioning supports rotation without changing existing addresses

### Per-User Key Derivation
- Each user gets a derivation index (0, 1, 2, ...) stored in the DB
- Private key = `HMAC-SHA256(masterSeed, "verdex-wallet:" + index)`
- Deposit address = `keccak256(publicKey)[12:32]`
- The private key is derived in memory ONLY when needed for signing
- The seed is zeroed from memory immediately after derivation

### Security Guarantees
- Private keys NEVER appear in any database table
- Private keys NEVER appear in any API response
- Private keys NEVER appear in any log
- The master key NEVER appears in the database
- Keys exist in server memory for the minimum possible duration

## Database Schema

11 tables + 5 RPC functions. See migration:
`supabase/migrations/20260720130000_custodial_wallet_system.sql`

### Tables
| Table | Purpose |
|-------|---------|
| `verdex_custodial_key_store` | Encrypted HD master seed (singleton) |
| `verdex_custodial_wallets` | User wallet records (deposit address + derivation index) |
| `verdex_custodial_balances` | available + pending + locked balances |
| `verdex_custodial_deposits` | Incoming on-chain deposit detection |
| `verdex_custodial_withdrawals` | Withdrawal requests + multi-sig workflow |
| `verdex_custodial_transfers` | Internal off-chain transfers |
| `verdex_custodial_transactions` | Unified transaction history |
| `verdex_custodial_treasury_signers` | Multi-sig signer roles |
| `verdex_custodial_treasury_signatures` | Per-withdrawal approval signatures |
| `verdex_custodial_aml_screenings` | AML screening results |
| `verdex_custodial_config` | Platform config (thresholds, fees, limits) |

### RPC Functions
| Function | Purpose |
|----------|---------|
| `verdex_custodial_transfer` | Atomic internal transfer (debit + credit in one transaction) |
| `verdex_custodial_credit_deposit` | Credit balance on deposit confirmation (idempotent) |
| `verdex_custodial_lock_for_withdrawal` | Lock funds for a pending withdrawal |
| `verdex_custodial_complete_withdrawal` | Complete withdrawal after broadcast |
| `verdex_custodial_cancel_withdrawal` | Cancel/reject withdrawal + unlock funds |

## API Endpoints

### User Endpoints (require Bearer auth)

| Method | Action | Description |
|--------|--------|-------------|
| GET | `custodial-balance` | Wallet + balance + deposit address |
| GET | `custodial-deposit-address` | Get deposit address (creates wallet) |
| POST | `custodial-withdraw` | Request withdrawal (KYC + AML gated) |
| POST | `custodial-transfer` | Internal transfer to another user |
| GET | `custodial-history` | Unified transaction history |
| GET | `custodial-deposits` | Deposit history |
| GET | `custodial-withdrawals` | Withdrawal history |

### Treasury Admin Endpoints (require treasury signer role)

| Method | Action | Description |
|--------|--------|-------------|
| GET | `admin-pending-withdrawals` | Withdrawals awaiting multi-sig approval |
| POST | `admin-sign-withdrawal` | Approve/reject a withdrawal |
| GET | `admin-health` | System health metrics |
| GET | `admin-balances` | All wallet balances (paginated) |

## Withdrawal Workflow

```
User requests withdrawal
         │
         ▼
   ┌─────────────┐
   │ KYC Check   │─── FAIL → 403 KYC_REQUIRED
   └──────┬──────┘
          │ PASS
          ▼
   ┌─────────────┐
   │ AML Screen  │─── PROHIBITED → 403 AML_BLOCKED
   └──────┬──────┘
          │ CLEAR/LOW/MEDIUM
          ▼
   ┌─────────────────────┐
   │ Lock funds (atomic) │─── INSUFFICIENT → 400
   └──────────┬──────────┘
              │
              ▼
   ┌──────────────────────┐
   │ Amount ≥ threshold?  │
   └──────┬───────┬───────┘
          │ YES   │ NO
          ▼       ▼
  awaiting_    approved
  signatures      │
       │          ▼
  Treasury    Withdrawal Worker
  signers     signs + broadcasts
  approve         │
       │          ▼
  Quorum     completed
  reached
       │
       ▼
  approved →
  Withdrawal Worker
```

## Internal Transfer Flow

```
User specifies recipient (username or address) + amount
         │
         ▼
   Resolve recipient → user_id
         │
         ▼
   KYC check + AML screen
         │
         ▼
   Atomic RPC: verdex_custodial_transfer
   (debit sender available + credit receiver available
    + create transfer record + log transactions)
         │
         ▼
   Completed (instant, off-chain, no gas)
```

## Deposit Detection Worker

Runs every 5 minutes via Vercel cron (`/api/cron/wallet-deposit-scan`):

1. Fetches all deposits in `detected` or `confirming` status
2. For each, queries the RPC for current confirmation count
3. If confirmations ≥ required → calls `verdex_custodial_credit_deposit`
4. If transaction reverted → marks as `failed`
5. Also scans for new incoming transactions to active deposit addresses

## AML Hooks

- Every withdrawal and transfer above the configured threshold is screened
- Screening checks: amount threshold, prior AML flags, address blocklist
- Results stored in `verdex_custodial_aml_screenings`
- `prohibited` risk level blocks the transaction
- `high` risk level requires manual review (admin dashboard)

## Rate Limiting

- Withdrawals: 5 per minute per user
- Transfers: 10 per minute per user
- All endpoints: standard IP-based rate limiting

## Audit Logging

Every wallet operation is logged via `logAudit()`:
- `wallet.withdrawal_requested`
- `wallet.transfer`
- Treasury signatures are append-only (trigger prevents UPDATE/DELETE)

## Testing

```bash
# Crypto module tests (18 tests)
node --test api/_wallet/crypto.test.js

# P2P handler tests (22 tests)
npm run test:p2p
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `WALLET_MASTER_KEY` | 32-byte key (base64/hex/passphrase) for seed encryption |

Generate with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Initialization

After applying the migration, initialize the key store:

```sql
-- Run in Supabase SQL Editor after setting WALLET_MASTER_KEY env var:
-- The encrypted seed is inserted by the API on first wallet creation,
-- OR you can pre-initialize it via an admin script.
```

## Related Files

- `api/_wallet/crypto.js` — Key encryption/derivation
- `api/_wallet/handler.js` — REST API handler
- `api/_wallet/deposit-worker.js` — Deposit detection worker
- `api/_wallet/crypto.test.js` — Test suite
- `supabase/migrations/20260720130000_custodial_wallet_system.sql` — Schema
- Flutter: `lib/data/api/wallet_api.dart` — Mobile API client
- Flutter: `lib/ui/tabs/wallet_tab.dart` — Custodial wallet UI
