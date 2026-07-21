# Verdex Mainnet Launch Runbook

**Version:** 1.0.0  
**Date:** 2026-07-20  
**Status:** Ready for deployment ceremony

## Overview

This runbook covers the complete mainnet deployment: validator setup, genesis
ceremony, contract deployment, treasury initialization, post-launch monitoring,
and rollback procedures.

**Estimated time:** 4–8 hours (with 4 validators on prepared servers)

---

## Pre-Launch Checklist

### Infrastructure (Complete BEFORE deployment day)

- [ ] **4 dedicated servers** provisioned (minimum 4 CPU, 8GB RAM, 200GB SSD each)
  - [ ] Server A (validator 0) — different provider/region
  - [ ] Server B (validator 1) — different provider/region
  - [ ] Server C (validator 2) — different provider/region
  - [ ] Server D (validator 3) — different provider/region
- [ ] **1 RPC node** provisioned (read-only, public-facing, behind load balancer)
- [ ] **Java 21+** installed on all validator servers
- [ ] **Besu 26.7.0** installed on all servers (verify SHA-256 of download)
- [ ] **Firewall rules** configured:
  - P2P port 30303–30306: open only to other validator IPs
  - RPC port 8545–8548: localhost only on validators
  - SSH: restricted to admin IPs
- [ ] **DNS records** created:
  - `rpc.verdexswap.site` → RPC load balancer
  - `explorer.verdexswap.site` → explorer frontend
  - `validator-{n}.verdexswap.site` → each validator (internal only)
- [ ] **Monitoring** set up: alerts for CPU, disk, memory, peer count, block height
- [ ] **Backups** configured: daily snapshot of chain data

### Keys and Governance

- [ ] **Gnosis Safe** deployed (2-of-3 multisig) for governance
  - [ ] 3+ hardware-backed Safe owner addresses recorded
  - [ ] Threshold confirmed ≥ 2
- [ ] **Arbiter addresses** (3+) recorded for P2P escrow dispute resolution
- [ ] **Trade attestor addresses** (2+) recorded for P2P escrow authorization
- [ ] **Genesis vault address** recorded (multisig-controlled, receives 1B VDX)

### Compliance

- [ ] **Legal review** complete for operating jurisdictions
- [ ] **KYC/AML procedures** documented and approved
- [ ] **Privacy policy** and **terms of service** published
- [ ] **Two independent security audits** completed with remediation sign-off
- [ ] **Bug bounty** program ready to launch

### Database

- [ ] **All Supabase migrations applied** (including custodial wallet + multi-token)
- [ ] **WALLET_MASTER_KEY** set in Vercel environment
- [ ] **TRADE_ATTESTOR_PRIVATE_KEY** set (if on-chain escrow is live)
- [ ] **Staff roles** seeded: at least 1 administrator + 1 moderator
- [ ] **P2P platform policy** configured: `p2p_enabled = true`

---

## Deployment Order

### Phase 1: Validator Initialization (on each validator server)

**Run on EACH of the 4 validator servers, sequentially or in parallel:**

```bash
# 1. Verify Besu is installed
besu --version  # Must show 26.7.0

# 2. Initialize validator 0 (on server A)
node mainnet/validator-manager.js init 0

# 3. Record the address output — DO NOT share the private key
# Output will show:
#   Validator address: 0x...
#   Share this address with the genesis config generator.

# 4. Repeat for validators 1–3 on their respective servers
node mainnet/validator-manager.js init 1  # on server B
node mainnet/validator-manager.js init 2  # on server C
node mainnet/validator-manager.js init 3  # on server D
```

**Collect from each validator (PUBLIC info only — never private keys):**
- Validator address (0x...)
- Node public key / enode URL (from Besu logs after first start)
- Server IP address + P2P port

### Phase 2: Genesis Configuration

```bash
# 1. Create deployment inputs file
# Fill in all 4 validator addresses, enodes, and the genesis vault address
cp mainnet/besu/DEPLOYMENT_INPUTS.template.json mainnet/besu/DEPLOYMENT_INPUTS.json
# Edit DEPLOYMENT_INPUTS.json with real values

# 2. Generate genesis + config
node mainnet/besu/create-qbft-release-config.js \
  mainnet/besu/DEPLOYMENT_INPUTS.json \
  mainnet/besu/generated

# 3. Verify the generated genesis.json
cat mainnet/besu/generated/genesis.json | jq .

# 4. Copy genesis.json to each validator server
scp mainnet/besu/generated/genesis.json server-a:~/verdex-besu/genesis.json
scp mainnet/besu/generated/genesis.json server-b:~/verdex-besu/genesis.json
scp mainnet/besu/generated/genesis.json server-c:~/verdex-besu/genesis.json
scp mainnet/besu/generated/genesis.json server-d:~/verdex-besu/genesis.json
```

### Phase 3: Start Validators

**Run on EACH validator server:**

```bash
# Start validator 0 (on server A)
node mainnet/validator-manager.js start 0

# Wait 10 seconds, then check
node mainnet/validator-manager.js status

# Start remaining validators
node mainnet/validator-manager.js start 1  # on server B
node mainnet/validator-manager.js start 2  # on server C
node mainnet/validator-manager.js start 3  # on server D
```

**Verify all 4 validators are running and producing blocks:**

```bash
# Check status — all should show ✅ RUNNING with increasing block numbers
node mainnet/validator-manager.js status

# Run health checks
node mainnet/validator-manager.js health

# Run AI ops scan
node mainnet/ai-ops-assistant.js scan
```

**Success criteria:**
- All 4 validators show ✅ RUNNING
- Block height is increasing (at least 1 new block every 10 seconds)
- Each validator has ≥ 3 peers
- No CRITICAL issues in health scan

### Phase 4: Contract Deployment

```bash
# Set environment variables (in a secure deployment terminal, NOT in source)
export VERDEX_MAINNET_CHAIN_ID=72010
export VDX_RPC_URL=http://localhost:8545  # or the RPC node URL
export MAINNET_GOVERNANCE_MULTISIG=0x...  # Gnosis Safe address
export MAINNET_GENESIS_VAULT=0x...        # Genesis vault (Safe-controlled)
export MAINNET_GOVERNANCE_MULTISIG_OWNERS=0x...,0x...,0x...
export MAINNET_GOVERNANCE_MULTISIG_THRESHOLD=2
export MAINNET_ARBITERS=0x...,0x...,0x...
export MAINNET_TRADE_ATTESTORS=0x...,0x...
export MAINNET_ARBITRATION_QUORUM=2
export MAINNET_DEPLOY_APPROVED=I_UNDERSTAND_MAINNET_DEPLOYMENT_IS_IRREVERSIBLE

# Deploy VDX token + P2P escrow
cd contracts
npx hardhat run scripts/deploy-mainnet.js --network verdexMainnet

# Record the output:
# - VDX contract address
# - P2P escrow address
# - Runtime code SHA-256 hashes
```

### Phase 5: Treasury Initialization

```bash
# 1. Transfer VDX ownership to the governance multisig
# (The deploy-mainnet.js script does this automatically)

# 2. Verify ownership transfer
npx hardhat console --network verdexMainnet
# > const vdx = await ethers.getContractAt('VerdexMainnetVDX', '0x...')
# > await vdx.owner()  # Should return 0x0 (no owner — immutable)

# 3. Verify the genesis vault holds 1B VDX
# > await vdx.balanceOf('0x...genesis_vault...')
# Should return 1000000000000000000000000000 (1B VDX in wei)

# 4. Pin the runtime code hashes in Vercel environment
# Set in Vercel:
#   VDX_MAINNET_VDX_ADDRESS=0x...
#   VDX_MAINNET_VDX_RUNTIME_CODE_SHA256=<hash from deploy output>
#   VDX_ESCROW_CONTRACT_ADDRESS=0x...
#   VDX_ESCROW_RUNTIME_CODE_SHA256=<hash from deploy output>
#   VERDEX_MAINNET_ENABLED=true
#   VERDEX_MAINNET_RELEASE_APPROVED=true
#   VERDEX_MAINNET_GENESIS_HASH=0x... (from genesis.json)
#   VDX_RPC_URL=https://rpc.verdexswap.site
```

### Phase 6: Post-Deployment Verification

```bash
# 1. Verify the public release boundary
curl https://verdexswap.site/api/network
# Should show: verified: true, contracts: { vdx, p2pEscrow }

# 2. Run the AI ops full scan
node mainnet/ai-ops-assistant.js scan

# 3. Run the contract test suite
cd contracts && npx hardhat test --network verdexMainnet

# 4. Test a P2P trade end-to-end (on staging first, then production)

# 5. Verify the block explorer
# https://explorer.verdexswap.site should show blocks and transactions
```

---

## Post-Launch Maintenance

### Daily

- [ ] Check `node mainnet/validator-manager.js status` — all 4 validators running
- [ ] Check `node mainnet/validator-manager.js health` — no critical issues
- [ ] Review AI ops alerts: `node mainnet/ai-ops-assistant.js scan`
- [ ] Monitor block production rate (target: 1 block / 5 seconds)
- [ ] Check pending withdrawals queue (process if > 0)

### Weekly

- [ ] Run deep log analysis on each validator: `node mainnet/ai-ops-assistant.js analyze <i>`
- [ ] Check disk space on all servers (chain data grows ~1-2GB/week)
- [ ] Review AML screening queue
- [ ] Backup verification: test restore from latest backup
- [ ] Review peer count trends — all validators should maintain ≥ 3 peers

### Monthly

- [ ] Apply Besu updates (if security patches released)
- [ ] Review validator performance metrics
- [ ] Rotate API keys and service tokens
- [ ] Security audit: review access logs, SSH keys, firewall rules
- [ ] Test failover: stop one validator, verify network continues, restart

### Quarterly

- [ ] Full disaster recovery drill: stop all validators, restore from backup
- [ ] Review and update this runbook
- [ ] Legal/compliance review for new jurisdictions
- [ ] Contract upgrade evaluation (if needed — requires new deployment, not proxy upgrade)

---

## Auto-Recovery

The validator manager includes auto-recovery:

```bash
# Run manually to recover any down nodes
node mainnet/validator-manager.js recover

# Or set up a cron job (every 5 minutes):
*/5 * * * * cd /opt/verdex && node mainnet/validator-manager.js recover >> /var/log/verdex-recovery.log 2>&1
```

The AI ops assistant can run continuously:

```bash
# Continuous monitoring (60-second intervals)
node mainnet/ai-ops-assistant.js watch 60
```

---

## Rollback Plan

### If a validator goes down:
1. Run `node mainnet/validator-manager.js recover`
2. If recovery fails, manually restart: `node mainnet/validator-manager.js restart <i>`
3. If restart fails, check logs: `node mainnet/validator-manager.js logs <i>`
4. If the node is corrupted, restore from backup:
   ```bash
   node mainnet/validator-manager.js stop <i>
   rm -rf ~/verdex-besu/validators/validator-<i>/data/*
   # Restore from backup
   node mainnet/validator-manager.js start <i>
   ```

### If the network stalls (no blocks for > 30 seconds):
1. Check all 4 validators: `node mainnet/validator-manager.js status`
2. If ≥ 3 validators are running, the network should self-heal
3. If < 3 validators are running, restart them immediately
4. If all 4 are running but no blocks: check peer connectivity and genesis configuration

### If a contract deployment fails:
1. The deploy script is atomic — failed deployments don't consume gas for ownership transfer
2. Check the deployer account balance
3. Verify the RPC is reachable
4. Re-run the deployment script after fixing the issue
5. If VDX was deployed but ownership transfer failed:
   ```bash
   # Manually transfer ownership
   npx hardhat console --network verdexMainnet
   # > const vdx = await ethers.getContractAt('VerdexMainnetVDX', '0x...')
   # > await vdx.transferOwnership(MAINNET_GOVERNANCE_MULTISIG)
   ```

### If the genesis is wrong:
1. Stop all validators
2. Fix the genesis configuration
3. Delete all chain data (ONLY if no real transactions have occurred)
4. Redeploy genesis and restart

**WARNING:** Once real user transactions exist on the chain, genesis cannot be
changed without a hard fork. Verify the genesis configuration thoroughly before
starting validators.

---

## Emergency Contacts

| Role | Responsibility | Contact |
|------|---------------|---------|
| Lead Operator | Validator management | [Set during deployment] |
| Treasury Signer 1 | Withdrawal approval | [Set during deployment] |
| Treasury Signer 2 | Withdrawal approval | [Set during deployment] |
| Treasury Signer 3 | Withdrawal approval | [Set during deployment] |
| Incident Commander | Coordinated response | [Set during deployment] |

---

## File Reference

| File | Purpose |
|------|---------|
| `mainnet/validator-manager.js` | Validator lifecycle: init, start, stop, restart, health, recover |
| `mainnet/ai-ops-assistant.js` | AI monitoring: scan, watch, log analysis, recommendations |
| `mainnet/besu/create-qbft-release-config.js` | Genesis + QBFT config generator |
| `contracts/scripts/deploy-mainnet.js` | VDX + escrow contract deployment |
| `api/_mainnet/handler.js` | Admin dashboard API (validators, blocks, treasury, users, KYC) |
| `MAINNET_NODE_RUNBOOK.md` | Network topology + pre-launch gates |
| `mainnet/WINDOWS_QBFT_IMPLEMENTATION_PLAN.md` | Windows-specific deployment guide |
