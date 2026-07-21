# Verdex Besu QBFT on Windows 11

This package is PowerShell-only and uses no Docker, Linux, or WSL. It installs
Java 21 and the latest official Besu ZIP, verifies the published ZIP SHA-256,
sets user-level `JAVA_HOME`, `BESU_HOME`, and PATH entries, scaffolds four
validator folders plus one non-validator RPC node, and builds deterministic
QBFT configuration from public deployment inputs.

Current Besu 26.7.0 requires Java 25 at runtime. The installer therefore keeps
Java 21 available under `VERDEX_JAVA21_HOME` and installs Java 25 separately as
Besu's active `JAVA_HOME`. Java 21 cannot load Besu's Java 25 class files.

For the complete staged runbook, responsibilities, command explanations, and
mainnet evidence gates, see `mainnet/WINDOWS_QBFT_IMPLEMENTATION_PLAN.md`.

Run in a normal PowerShell window from the repository root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& .\mainnet\windows\Install-VerdexBesuToolchain.ps1
& .\mainnet\windows\Initialize-VerdexBesuProject.ps1
& .\mainnet\windows\Test-VerdexBesuToolchain.ps1
```

Close and reopen PowerShell after toolchain installation. Copy
`C:\Verdex\besu-qbft\network\inputs\DEPLOYMENT_INPUTS.template.json` to
`DEPLOYMENT_INPUTS.json`. The whitepaper-derived defaults already select chain
ID `72010`, 5-second QBFT blocks, a 30M gas limit, a 1 gwei minimum gas price,
and the verified Besu distribution. Replace only the deployment-controlled
public values: four validator addresses, four enodes, two native-gas addresses,
the genesis timestamp, RPC hostname, and edge owner. Then run:

```powershell
& .\mainnet\windows\Build-VerdexQbftConfig.ps1
```

This creates the deterministic `genesis.json`, a same-peer-list
`static-nodes.json`, a node-only `permissions_config.toml`, node-specific TOML
files, and distinct local P2P/metrics ports. It intentionally rejects missing
or placeholder public deployment values.

The project tree is:

```text
C:\Verdex\besu-qbft\
  network\inputs\
  network\generated\
  network\evidence\
  nodes\validator-1..4\{config,data,logs,secure-key-reference}\
  nodes\rpc-1\{config,data,logs}\
  logs\
```

## Start and verify a local rehearsal

The four validator key files must already exist outside `C:\Verdex` and remain
under the control of their operators. The launcher checks that they are outside
the project tree, does not print their content, and starts the five Besu
processes hidden with per-node stdout/stderr logs.

```powershell
& .\mainnet\windows\Start-VerdexNetwork.ps1 `
  -ValidatorKeyFiles @(
    'D:\Verdex-operator-1\validator.key',
    'D:\Verdex-operator-2\validator.key',
    'D:\Verdex-operator-3\validator.key',
    'D:\Verdex-operator-4\validator.key'
  )

& .\mainnet\windows\Test-VerdexNetwork.ps1
```

`Test-VerdexNetwork.ps1` checks the expected chain ID, network ID, at least
four peers visible to the RPC node, block-height growth over 12 seconds, and
Prometheus metrics on ports 9545 through 9549. A passing rehearsal remains
`RUNNING_LOCAL_REHEARSAL_NOT_MAINNET`; it is not launch evidence.

Stop or restart only the recorded Besu process IDs:

```powershell
& .\mainnet\windows\Stop-VerdexNetwork.ps1

& .\mainnet\windows\Restart-VerdexNetwork.ps1 `
  -ValidatorKeyFiles @(
    'D:\Verdex-operator-1\validator.key',
    'D:\Verdex-operator-2\validator.key',
    'D:\Verdex-operator-3\validator.key',
    'D:\Verdex-operator-4\validator.key'
  )
```

## Network ports and exposure

| Node | P2P | Metrics | JSON-RPC / WebSocket |
|---|---:|---:|---|
| validator-1 | 30303 | 9545 | disabled |
| validator-2 | 30304 | 9546 | disabled |
| validator-3 | 30305 | 9547 | disabled |
| validator-4 | 30306 | 9548 | disabled |
| rpc-1 | 30307 | 9549 | HTTP 8545 / WS 8546, loopback only |

Do not expose 8545, 8546, or metrics ports directly to the internet. The RPC
node binds HTTP and WebSocket to `127.0.0.1`; publish it only through a
TLS-authenticated, rate-limited edge proxy after its public hostname is live.

## Common Windows errors

- `UnsupportedClassVersionError`: Java 21 cannot run Besu 26.7.0; rerun the
  installer, which keeps Java 21 but configures Java 25 as Besu's `JAVA_HOME`.
- `Address already in use`: stop the recorded network or change the conflicting
  local port. Do not run two copies of the same node directory.
- `Expected at least 4 peers`: verify all four P2P ports, the enode host/IP and
  port, `static-nodes.json`, and `permissions_config.toml` are identical across
  nodes.
- `Block height did not advance`: check each validator's stderr log and confirm
  all four operators supplied the exact keys corresponding to the validator
  public addresses committed to genesis.
- `Host not authorized`: use the loopback RPC URL locally or add the approved
  hostname to `publicRpc.hostAllowlist` during the next signed release build.

To start a validator after its operator has created a protected key outside the
project directory:

```powershell
& .\mainnet\windows\Start-VerdexNode.ps1 `
  -NodeName validator-1 `
  -NodePrivateKeyFile C:\secure-operator-1\validator.key
```

Start the read-only node without a validator key:

```powershell
& .\mainnet\windows\Start-VerdexNode.ps1 -NodeName rpc-1
```

Private keys, seed phrases, Safe-owner secrets, audit signatures, and legal
approvals are intentionally not generated. A filled project remains a staging
configuration until independently signed evidence and runtime verification pass.
