# Verdex Mining Ecosystem — Full Architecture Map

> Status: PLANNING — build starts in 3 days
> Confirmed model: **Points farming** (proof-of-uptime → Verdex Points → VDX at launch)

---

## 0. How "Mining" Works (Core Concept)

VDX is a DEX utility/governance token, not a PoW coin. So "mining" = **proof-of-uptime points farming**:

1. User runs the Verdex CLI client on their machine (Linux or Windows)
2. The CLI sends a signed **heartbeat** to the backend every 5 minutes
3. Each heartbeat includes a **proof-of-work challenge** from the server (prevents fake clients)
4. Every 24 hours of *valid continuous uptime* credits **Verdex Points (VP)** to the user's wallet
5. At VDX mainnet launch (**Dec 12, 2026**), accumulated VP converts to VDX tokens at a published ratio

This mirrors successful airdrop-farming CLIs (Celestia light nodes, etc.) and is the correct model for a pre-launch DEX token.

---

## 1. High-Level Map — User Journey

```
[User] --(1) Gmail sign-in--> [verdexswap.site]
   |
   | (2) Dashboard opens: Wallet (0 VP) + "Download Miner" buttons
   v
[Download CLI binary] -- Linux .tar.gz / Windows .zip
   |
   | (3) Run: verdex auth  --> browser opens --> authorize device
   v
[CLI gets API token] (stored encrypted locally)
   |
   | (4) Run: verdex mine
   v
[CLI heartbeat loop] -- every 5 min --> [Backend /api/heartbeat]
   |                                       |
   |  (5) 24h valid uptime                  | (validate + record)
   v                                       v
[VP credited to wallet] <----- [daily credit cron job]
   |
   | (6) At launch Dec 12 2026
   v
[VP --> VDX conversion snapshot] --> [Official Verdex Wallet]
```

---

## 2. Components

### A. Web Authentication (Supabase + Google OAuth)
- **Supabase Auth** with Google OAuth provider (Gmail login)
- Creates account in `auth.users` (Supabase-managed, secure)
- `profiles` table extends auth user with username, wallet link
- JWT sessions via secure httpOnly cookies
- Protected `/dashboard` route (only visible after login)
- One account per Google identity (Sybil resistance)

### B. Backend API (Vercel Serverless Functions, Node.js)
| Endpoint | Purpose |
|----------|---------|
| `/api/auth/session` | Return current logged-in user |
| `/api/wallet` | Get VP balance + transaction history |
| `/api/mining/download?os=linux\|windows` | Authenticated CLI binary download |
| `/api/mining/token` | Generate a scoped device API token |
| `/api/mining/challenge` | Issue proof-of-work challenge for heartbeat |
| `/api/mining/heartbeat` | **Core mining endpoint** — validate + record uptime |
| `/api/mining/status` | User's mining stats (uptime, streak, rank) |
| `/api/mining/leaderboard` | Global rankings |
| `/api/admin/points/credit` | Daily cron — credit VP for valid uptime |

### C. CLI Miner Application (Go — cross-platform single binary)
- **Why Go:** single static binary, trivial cross-compile to Linux/Windows/amd64, tiny size, no runtime deps
- Commands:
  - `verdex auth` — device authorization flow (opens browser, like `gh auth login`)
  - `verdex mine` — start heartbeat loop + live TUI stats
  - `verdex status` — show current points, uptime, streak
  - `verdex wallet` — show wallet balance
  - `verdex stop` — graceful stop (saves session)
  - `verdex whoami` — show linked account
- Device authorization flow (device code → browser → token)
- Encrypted local token storage (OS keychain where available)
- **Device fingerprint** (machine ID hash) — prevents multi-instance farming on one machine
- Live TUI: points, uptime today, streak, network rank, heartbeat status

### D. Points Ledger (Supabase Postgres)
- Off-chain **double-entry ledger** — immutable, append-only
- `point_transactions` table (every credit/debit is a row)
- Wallet balance = **derived** from sum of transactions (never stored directly — guarantees integrity)
- Daily cron job credits VP for users with valid 24h uptime
- Full audit trail — every point is traceable to a heartbeat

### E. Official Verdex Wallet
- **Pre-launch:** custodial VP wallet shown in the web dashboard (points only, off-chain)
- **Post-launch (Dec 12 2026):** VP → VDX conversion snapshot at published ratio
- **"Only supports VDX":** wallet UI locked to VDX token, no external token imports
- **DECISION NEEDED:** post-launch wallet = custodial (you hold keys, easier, KYC risk) vs. non-custodial (user holds keys, harder). See §8.

---

## 3. Database Schema (Supabase Postgres)

```
auth.users                    (Supabase-managed, Google OAuth)
   │
   ├── profiles                  id (FK auth.users), username, created_at
   │
   ├── wallets                   user_id (FK), vp_balance_derived, vdx_balance (post-launch)
   │
   ├── mining_sessions           id, user_id, status (active/paused), 
   │                             device_fingerprint, started_at, last_heartbeat_at
   │
   ├── heartbeats                id, session_id, timestamp, nonce, 
   │                             pow_solution, ip_address, valid (bool)
   │
   ├── point_transactions        id, user_id, amount, type (mining/referral/bonus),
   │                             balance_after, created_at  (append-only)
   │
   ├── api_tokens                id, user_id, token_hash (bcrypt), name,
   │                             created_at, last_used_at, revoked_at
   │
   ├── download_tokens           id, user_id, one_time_token, os, expires_at
   │
   ├── device_fingerprints       fingerprint_hash, user_id, first_seen, is_banned
   │
   └── audit_logs                id, user_id, action, ip, user_agent, timestamp
```

All tables use **Row Level Security (RLS)** — users can only read/write their own rows; service role handles cross-table ops.

---

## 4. Security Model (security-first)

> Honest note: **"zero vulnerabilities" cannot be guaranteed by anyone.** We follow security-first best practices and recommend a 3rd-party audit before mainnet. I will not promise zero bugs — I will promise a security-first design.

- **OAuth 2.0** Google login (no password handling on our side)
- **JWT sessions** + refresh token rotation
- **API tokens** hashed at rest (bcrypt), scoped, revocable, rate-limited
- **Device fingerprinting** — 1 active miner per machine
- **Proof-of-work** on heartbeats — server issues challenge, CLI solves it (prevents cheap fake clients)
- **Heartbeat replay protection** — nonce + timestamp window (reject old/replayed)
- **Rate limiting** per IP + per token (Vercel + Supabase)
- **Supabase RLS** on every table
- **Encrypted secrets** — Vercel env vars, rotated regularly, never in code
- **Audit log** of every sensitive action (login, token gen, download, points credit)
- **Signed binaries** — CLI downloads are code-signed (checksums published)
- **CORS** locked to verdexswap.site

---

## 5. Anti-Cheat (critical for points integrity)

| Attack | Defense |
|--------|---------|
| Run many miners on 1 machine | Device fingerprint hash → 1 active session per device |
| Fake heartbeats from a script | Server-issued proof-of-work challenge per heartbeat |
| Replay old heartbeats | Nonce + 60s timestamp window, reject duplicates |
| Impossible uptime (25h/day) | Max gap tolerance 10 min, daily cap = 24h |
| Multiple Google accounts (Sybil) | 1 account per Google identity + IP/fingerprint anomaly detection |
| Precompute PoW solutions | Random challenge per request, short validity window |
| Botnet of farms | Rate limit + anomaly scoring + manual review flags |

---

## 6. Tech Stack

| Layer | Tech |
|-------|------|
| Auth | Supabase Auth (Google OAuth provider) |
| Database | Supabase Postgres + RLS |
| API | Vercel Serverless Functions (Node.js) |
| CLI Miner | **Go** (single binary, cross-compiled linux/windows amd64) |
| Wallet + Dashboard | Existing site (vanilla JS) + new `/dashboard` page |
| Cron (daily credit) | Vercel Cron Jobs |
| Binary distribution | GitHub Releases (signed binaries + checksums) |

---

## 7. Build Order (when we start in 3 days)

| Phase | Work | ~Time |
|-------|------|-------|
| 1 | Google OAuth login + dashboard UI + wallet display | 1 day |
| 2 | DB schema + RLS + device auth API + token gen | 1 day |
| 3 | CLI (Go): auth flow + heartbeat + TUI | 2 days |
| 4 | Points ledger + daily credit cron + wallet derivation | 1 day |
| 5 | Anti-cheat: PoW, fingerprint, replay, rate limits | 1 day |
| 6 | Download flow + signed binaries + checksums | 0.5 day |
| 7 | Security hardening + audit logging + testing | 1.5 days |

---

## 8. Key Decisions — CONFIRMED ✅

| Decision | Choice | Impact |
|----------|--------|--------|
| **Post-launch wallet** | ✅ **Non-custodial** (user holds keys, we never see them) | Need key generation + mnemonic backup flow in wallet; no custody risk; users responsible for key safety |
| **CLI language** | ✅ **Go** | Single static binary, cross-compiled linux/windows, ~10MB, no runtime deps |
| **Daily VP rate** | ✅ **10 VP/day + streak bonus** (+2 VP per consecutive day, cap +20) | Daily max = 10 + min(streak×2, 20) = up to 30 VP/day |
| **Referral program** | ✅ **Yes — 10% lifetime** of referee's VP | Need referral codes + link sharing + lifetime tracking in ledger |

### Confirmed Points Economy
- Base rate: **10 VP / 24h valid uptime**
- Streak bonus: **+2 VP per consecutive day**, capped at **+20 VP**
- Daily max for a maxed streak: 10 + 20 = **30 VP/day**
- Referral: earn **10% of all VP** earned by your referrals — for life
- Breaking a streak (missed day) resets bonus to 0, restarts at +0

### Non-Custodial Wallet Implications (confirmed)
- Wallet generates a **seed phrase (12/24 words)** locally on first setup — NEVER sent to server
- User signs a message with their key to prove ownership when claiming VDX at launch
- At launch: VP balance snapshot → user signs claim → VDX sent to their address
- We **never store private keys** — only public addresses + signed claims
- Users must be warned: **lose your seed = lose your VDX** (no recovery)


---

## 9. Legal / Regulatory Note (brief)

- Points farming toward an airdrop may be viewed as a security in some jurisdictions
- A custodial wallet may trigger money-transmitter / KYC requirements
- We should add a terms-of-service + disclaimer before launch
- Consider geo-restrictions (e.g., block US/UK users if needed)

This is informational, not legal advice — recommend a crypto lawyer review before mainnet.
