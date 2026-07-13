# VerdexSwap Governance Model

## Version 1.0 | July 2026

---

## What is VerdexSwap's governance structure?

VerdexSwap uses a multi-signature governance model to eliminate single points of failure. No individual developer can unilaterally modify smart contracts, mint tokens, adjust fees, or withdraw protocol funds. All critical operations require approval from multiple independent signers.

---

## Multi-Sig Configuration

| Parameter | Value |
|-----------|-------|
| Wallet Type | Gnosis Safe (safe.global) |
| Threshold | 2-of-3 minimum |
| Timelock | 48 hours before execution |
| Network | Verdex PRC20 Testnet (Chain ID 7201) |

---

## What actions require multi-sig approval?

The following operations are classified as **critical** and require multi-signature approval:

1. **Smart Contract Upgrades** — Any modification to deployed contract logic
2. **Token Minting** — Creating new VDX tokens beyond the initial supply
3. **Fee Adjustments** — Changing swap fees, farm emission rates, or staking parameters
4. **Treasury Withdrawals** — Moving funds from the protocol treasury
5. **Validator Changes** — Adding or removing PoA consensus validators
6. **Emergency Pause** — Pausing protocol operations in case of exploit

---

## Signers

| Role | Identity | Status |
|------|----------|--------|
| Core Developer (Lead) | Swift | ✅ Active |
| Technical Advisor | TBD | 🔜 Pending |
| Community Representative | TBD | 🔜 Pending |

> **Note:** Additional signers will be onboarded as the project scales. The threshold will be increased proportionally (e.g., 3-of-5 after mainnet launch).

---

## Timelock Mechanism

All multi-sig transactions are subject to a **48-hour timelock**:

1. A signer proposes a transaction
2. The required number of signers approve it
3. The transaction enters a 48-hour waiting period
4. During this period, the community can review the pending action
5. After 48 hours, the transaction can be executed

This ensures transparency and gives the community time to raise concerns before any critical change takes effect.

---

## Transparency Commitments

- All multi-sig transactions are publicly visible on the block explorer
- Major governance decisions will be announced on Twitter/X (@VerdexSwap) at least 48 hours before execution
- The community can verify all pending transactions at any time through the Gnosis Safe interface

---

## How to verify

Once the Gnosis Safe is deployed, the address will be published here and on the VerdexSwap website. Anyone can independently verify:
- The number of signers
- The approval threshold
- All pending and executed transactions
- The timelock duration

---

*This governance model will evolve as VerdexSwap transitions from testnet to mainnet. Community governance proposals via VDX token voting are planned for Phase 5 of the roadmap.*
