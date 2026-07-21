# Verdex Mainnet Whitepaper Derivation and Gaps

Status: internal architecture derivation; not an audit, legal approval, signed
genesis, or mainnet launch authorization.

## Parameters derived directly from the published whitepaper

- EVM-compatible custom Layer 1 using Proof of Authority.
- Fixed VDX supply of 1,000,000,000 PRC20 tokens.
- Allocations: 40% liquidity mining/farms, 20% treasury/ecosystem, 15%
  team/advisors, 15% community/airdrops, and 10% private sale.
- EIP-1559 transaction pricing and base-fee burning.
- Non-upgradeable core smart contracts, modular replacements, timelocked
  governance, multisignature treasury, hardware-backed keys, formal
  verification, a bug bounty, and two independent audits before mainnet.

## Architecture decisions added because the whitepaper is silent

- QBFT is the Besu PoA consensus mechanism, with four independently controlled
  validators so one validator can fail without violating the BFT assumption.
- Proposed mainnet chain ID and network ID: `72010`. The published `7201` remains
  testnet-only. The proposal was absent from the public chain registry when
  checked on 2026-07-18 and must be checked again during the genesis ceremony.
- Five-second blocks, ten-second request timeout, 30,000-block epochs, a
  30,000,000 block gas limit, and a 1 gwei minimum gas price.
- Consensus block reward is zero. VDX rewards are transfers from fixed,
  pre-funded allocation vaults; validators cannot mint VDX.
- The Android 25 VDX daily figure is a per-account maximum, not a guaranteed
  issuance rate. It requires KYC, a global budget, idempotent claims, abuse
  controls, and a Safe-funded audited distributor.

## Token emission contradiction requiring ratification

The whitepaper says farming begins at 5,000,000 VDX per week, declines 10% each
quarter, uses a 400,000,000 VDX allocation, and lasts approximately 6-8 years.
Those statements cannot all be true:

- Thirteen weeks per quarter and a 10% geometric decay produce a theoretical
  total of 650,000,000 VDX.
- Approximately 398,176,682 VDX is emitted after nine quarters, so the 400M cap
  is effectively exhausted shortly afterward (about 2.25 years).
- To target the same 400M allocation, the initial weekly rate would be about
  3.34M for six years, 3.25M for seven years, or 3.19M for eight years.

The deployed distributor must enforce the 400M hard cap. The initial weekly
rate and target duration must be selected in a signed tokenomics resolution
before contract deployment.

## Evidence that cannot be derived from prose

The whitepaper cannot create or replace validator/HSM key attestations, Safe
owner signatures, a block-zero hash, contract deployment receipts, runtime-code
hashes, independent audit reports, remediation sign-offs, or legal/KYC approval.
The release verifier intentionally continues to reject mainnet until those
external artifacts are supplied and cryptographically verified.
