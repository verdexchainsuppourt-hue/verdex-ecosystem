# Verdex mainnet node and validator runbook

## Do not promote the current testnet node

The existing `verdex-chain` source identifies itself as testnet, includes a
testnet chain ID, and has test signing material in historical source. It must
not be renamed or pointed at real VDX funds. Rotate every exposed test key,
remove secret-bearing scripts from version control, and build the mainnet client
from a separate reviewed release. The present JavaScript `new Function` contract
runtime is not a safe deterministic EVM for mainnet custody; the audited
EVM-compatible contracts in `contracts/contracts/mainnet/` require a real,
independently reviewed EVM execution client.

## Validator topology

Run at least four geographically and administratively independent validators:

```text
                    public RPC/load balancer
                      /        |        \
                read RPC    indexer    explorer API
                      |
           private validator peer network
        validator A - validator B - validator C - validator D
                      |
           isolated snapshots, metrics and alerting
```

Validators expose only authenticated P2P ports to allowlisted peers. Public JSON
RPC is a separate read-only fleet with strict rate limits and method allowlists.
Block-proposer keys live in HSMs or hardware-backed remote signers; never in a
repository, APK, Vercel variable, Docker image, shell history or startup command.
Use an offline genesis-key ceremony and a multisig/timelock for validator-set
changes. Test backups and restore drills before launch.

## Free tiers: use only for local development or devnet

| Service | Useful free resource | Verdict |
|---|---|---|
| Oracle Cloud Always Free | Two AMD micro VMs or Arm capacity equivalent to 2 OCPUs / 12 GB memory, plus 200 GB block volume; capacity is not guaranteed. | Best free option for an experimental devnet validator. |
| Google Cloud free tier | One small `e2-micro`, up to 30 GB standard disk and 1 GB monthly egress. | Suitable for a lightweight devnet RPC only. |
| Render free web service | Spins down after inactivity and has ephemeral local storage. | Not suitable for any blockchain node. |

Free tiers do not provide the uptime, persistent storage guarantees, DDoS
protection, independent operations, key management or bandwidth needed for a
real-money validator network. A production mainnet needs paid, redundant hosts
in at least three providers/regions, monitoring, backups, incident response and
an operations budget. Do not run the P2P escrow or public wallet RPC against a
free-tier node.

Official hosting references: [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Google Cloud free program](https://cloud.google.com/free/docs/free-cloud-features), and [Render free-instance behavior](https://render.com/docs/free#spinning-down-on-idle).

## Pre-launch gates

1. Finalize a unique mainnet chain ID and register it only after a staging
   network proves peer discovery, replay protection, EIP-155 signatures and
   finality behavior.
2. Publish the signed genesis allocation manifest. The included template exactly
   preserves the whitepaper's 40/20/15/15/10 allocation and the one-billion VDX
   maximum supply; replace every placeholder with a reviewed multisig or audited
   vesting vault address during a key ceremony.
3. Complete independent protocol, node-client, bridge and contract audits. Run
   a public bug bounty and load/failure tests.
4. Deploy the fixed-supply token and escrow only to a staging chain first. Verify
   source, bytecode, ABI, events, multisig roles and EIP-712 signatures.
5. Obtain written legal/compliance approval for the applicable countries and
   manual KYC/AML process. Keep P2P disabled until this and on-chain escrow
   verification are complete.
6. Configure public website/APK/desktop RPC endpoints only after independent RPC
   nodes reach finality and explorer data agrees with at least two nodes.

## Required mainnet environment values

The deployment script intentionally rejects testnet chain ID 7201. In a secure
deployment workstation or CI secret store—not in source—set:

```text
VDX_RPC_URL=https://rpc.example-mainnet-domain/rpc
VERDEX_MAINNET_CHAIN_ID=<approved unique chain ID>
VERDEX_MAINNET_GENESIS_HASH=<signed genesis block hash>
VERDEX_MAINNET_PROTOCOL_VERSION=<reviewed protocol release identifier>
MAINNET_GENESIS_VAULT=<audited allocation vault multisig>
MAINNET_GOVERNANCE_MULTISIG=<governance timelock/safe>
MAINNET_GOVERNANCE_MULTISIG_OWNERS=<three or more reviewed Safe owner addresses>
MAINNET_GOVERNANCE_MULTISIG_THRESHOLD=<reviewed threshold, minimum 2>
MAINNET_ARBITERS=<three or more independent arbiter addresses>
MAINNET_TRADE_ATTESTORS=<two or more hardware-backed KYC/P2P attestor addresses>
MAINNET_ARBITRATION_QUORUM=2
MAINNET_DEPLOY_APPROVED=I_UNDERSTAND_MAINNET_DEPLOYMENT_IS_IRREVERSIBLE
```

Do not set these on the public website until the contracts have a published
address and independent audit sign-off. After deployment, pin the printed
runtime-code SHA-256 values in `VDX_MAINNET_VDX_RUNTIME_CODE_SHA256` and
`VDX_ESCROW_RUNTIME_CODE_SHA256`; the public release boundary rejects code that
does not match. `VDX_RPC_URL` and all wallet UI mainnet flags must remain
unset/disabled beforehand so the product fails closed instead of directing
users to a testnet or improvised endpoint.
