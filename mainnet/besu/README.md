# Verdex Besu QBFT mainnet configuration

This directory contains a deterministic **pre-deployment** generator for an
EVM-compatible Besu QBFT network. It produces only public configuration and
never creates a validator key, HSM key, Safe owner, deployer secret, audit, or
legal approval.

The Windows release profile pins the official Besu ZIP version, HTTPS source,
and published SHA-256. It does not require or reference a Docker image.

The production target requires four independent validator operators. Four is
intentional: QBFT needs four validators for Byzantine fault tolerance. A loss
of more than one third of validators stops block production, so every operator
must rehearse recovery and operate in a distinct administrative domain.

## Fill inputs during the deployment ceremony

Copy `DEPLOYMENT_INPUTS.template.json` to an offline, access-controlled release
workstation as `DEPLOYMENT_INPUTS.json`. Replace every
`TO_BE_PROVIDED_DURING_DEPLOYMENT` value with public values supplied by the
operator or release board:

- a reviewed unique chain ID and a launch timestamp at least five minutes away;
- four public validator addresses and four public bootnode enodes;
- the pinned, reviewed official Besu Windows ZIP version, URL, and SHA-256;
- native-gas allocations for a treasury and a one-time deployment account;
- public RPC hostname, allowed CORS origins, and the owner of the external edge
  rate limiter.

The generator refuses placeholders, duplicate identities, testnet ID 7201,
unsafe QBFT timings, missing native-gas allocations, or an existing output
directory:

```powershell
node mainnet/besu/create-qbft-release-config.js `
  mainnet/besu/DEPLOYMENT_INPUTS.json `
  C:\secure-release\verdex-mainnet-configuration
```

The output is explicitly marked `GENERATED_NOT_SIGNED_NOT_DEPLOYED` and
contains `genesis.json`, a sorted validator list, a node allowlist, separate
validator/RPC TOML files, and a release-config manifest. Operators must compare
the SHA-256 configuration hash independently before starting a staging chain.

## Required operator-owned settings

`validator.toml` intentionally omits a private key path and HSM credential.
Each operator must wire its own hardware-backed remote signer or Besu security
module directly on its host. Validator RPC is disabled; public RPC runs only on
non-validator nodes behind TLS, an edge rate limiter, request-size limits, and
an RPC method allowlist. Do not expose QBFT administration RPC methods publicly.

The generator implements QBFT block-header validator selection with a canonical
RLP `extraData` list. It also emits `toEncode.json` so an operator can compare
the result against Besu's own `besu rlp encode --from=toEncode.json
--type=QBFT_EXTRA_DATA` command before signing anything.

## Asset and deployment boundary

The existing Verdex contract deployment flow treats VDX as a fixed-supply PRC20
asset, minted once to a contract-backed genesis vault. An EVM network still
needs a native gas policy for transaction fees; `nativeGasAllocations` are not
VDX reward allocations and must be finalized in a separate economic and legal
approval. The generator sets QBFT block rewards to zero so it cannot create an
unreviewed ongoing issuance stream.

Do not copy generated files into the APK, website, Vercel environment, or a
public repository until the genesis ceremony, Safe configuration, audited
contract deployment, release-evidence verification, and legal/KYC approval have
all passed.
