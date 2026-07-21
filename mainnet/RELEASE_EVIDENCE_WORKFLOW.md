# Verdex mainnet release-evidence workflow

This workflow is a launch gate, not a way to manufacture a launch. It accepts
only evidence already produced by independent operators and fails closed if a
chain, custody configuration, audit, or compliance approval cannot be proved.

## What must exist before verification

1. A separate, reviewed EVM client release and an offline genesis ceremony.
   The ceremony authority publishes a signed genesis artifact and gives the
   release operator its **public** Ed25519 SPKI key out of band.
2. At least four independently operated validators. Each supplies its public
   validator address, a separate public HTTPS RPC hostname, and a signature
   over the exact claims in `validators[]`. The release operator registers each
   validator's public Ed25519 key out of band in the trusted-key registry.
3. A deployed Safe-compatible governance Safe with at least three owners and a
   threshold of at least two. Only owner public addresses are recorded; no
   owner seed phrase, private key, hardware-wallet export, or HSM credential is
   ever placed in this repository, an APK, Vercel, or this verifier.
4. VDX and P2P escrow deployed to the already verified chain. Record their
   addresses and SHA-256 hashes of their exact deployed runtime bytecode.
   Release contracts must be direct immutable deployments: the verifier rejects
   an EIP-1967 implementation pointer.
5. A public independent audit report and a redacted legal/KYC approval letter.
   Their exact documents must be published over HTTPS and each must be signed
   by a separately registered auditor or compliance public key. The legal
   letter must contain no KYC documents, customer data, secret credentials, or
   private operational details.

The tool cannot prove that companies are truly independent, that an auditor is
qualified, or that a legal approval is valid in a jurisdiction. Those are human
governance and legal determinations. It verifies the integrity and signature of
the evidence after the board/auditor/compliance owner has made those decisions.

## Create the evidence dossier

Copy these two templates outside the public web root and replace every
`REPLACE_*` value with independently supplied public evidence:

```text
mainnet/MAINNET_RELEASE_EVIDENCE.template.json
mainnet/TRUSTED_VALIDATOR_KEYS.template.json
```

Keep the final evidence manifest in the reviewed release repository. Keep the
three trust-root public keys in CI/Vercel release configuration or a board-held
release notebook. They are public values, but they must be established
out-of-band; accepting a trust root embedded only in the manifest would let an
attacker sign their own fake evidence.

Every signature is an Ed25519 signature over UTF-8 canonical JSON: object keys
are lexicographically sorted, arrays remain in order, strings use JSON escaping,
and there is no whitespace. The verifier's `canonicalJson()` export is the
authoritative encoder. Sign only from the appropriate offline HSM, remote
signer, or independently controlled signing workstation.

Payloads to sign are:

```js
// signedGenesis.attestation
{ chainId, genesisHash, artifactSha256, authority, signedAt }

// each validators[].attestation
{ chainId, genesisHash, operatorId, validatorAddress, rpcEndpoint, signedAt }

// audit.remediation.attestation
{ status, reportSha256, signedAt, scope }

// legalKycApproval.attestation
{ approvalDocumentSha256, approval }
```

The audit scope binds the exact VDX and escrow runtime-code hashes plus the
reviewed EVM client release, source commit, and consensus engine. The auditor's
remediation signature is deliberately separate from the audit report itself. A
historical scan, an unsigned PDF, a self-issued report, or a report that does
not cover those exact released artifacts is not a passing release gate.

## Run the verifier in isolated release CI

Set public trust roots through the CI secret/configuration store. Do not place
private keys in those values.

```powershell
$env:VERDEX_TRUSTED_GENESIS_ED25519_PUBLIC_KEY = '<base64 DER SPKI public key>'
$env:VERDEX_TRUSTED_AUDITOR_ED25519_PUBLIC_KEY = '<base64 DER SPKI public key>'
$env:VERDEX_TRUSTED_COMPLIANCE_ED25519_PUBLIC_KEY = '<base64 DER SPKI public key>'

node contracts/scripts/verify-mainnet-evidence.js `
  mainnet/MAINNET_RELEASE_EVIDENCE.json `
  --trusted-validators mainnet/TRUSTED_VALIDATOR_KEYS.json
```

The command verifies all of the following before printing `"status":
"VERIFIED"`:

- Four distinct public RPC hosts agree on chain ID, block-zero hash, and a
  fresh latest head within the configured block-height tolerance.
- The signed genesis artifact, audit report, and legal/KYC approval document
  download securely and match the declared SHA-256 hashes.
- The offline genesis authority, four registered validator operators,
  independent auditor, and compliance authority signed exactly the evidence
  being released.
- The on-chain Safe exposes the approved owner set and threshold.
- The VDX and escrow addresses contain the approved runtime bytecode and are
  not silently upgradeable EIP-1967 proxies.

Save the successful JSON output with the release tag and have the release board
review it. A failed check is a release blocker. Only after a signed board change
record confirms the output may a human release manager set
`VERDEX_MAINNET_RELEASE_APPROVED=true`; that switch must not be automated from
an unreviewed web request.

## GitHub release gate

The repository also contains
`.github/workflows/verify-mainnet-evidence.yml`. It runs whenever the final
evidence dossier changes or when a release manager starts it manually. The
workflow refuses to run without the final (non-template) manifest, the trusted
validator key registry, and all three separately configured public trust roots.
It stores only the non-secret verification summary as a build artifact. Configure
the three `VERDEX_TRUSTED_*_ED25519_PUBLIC_KEY` values as GitHub Actions
environment secrets, protect the release branch, and require this workflow as a
status check before any production deployment workflow. Do not give the
workflow a validator key, Safe owner key, HSM credential, or a production
deployment token.

## Deliberate non-automation

The following actions are intentionally outside this tool:

- generating validator, HSM, Safe-owner, or deployer private keys;
- signing a genesis, audit remediation, or legal approval on someone else's
  behalf;
- creating a Safe owner set or moving/custodying funds;
- deploying real-money contracts before the evidence gate passes;
- turning on P2P, mining rewards, or public transfers without the release
  board's explicit recorded approval.

They require independently controlled organizations and accountable humans,
not a website deployment or an AI agent.
