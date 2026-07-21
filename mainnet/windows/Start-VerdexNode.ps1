[CmdletBinding()]
param(
  [ValidateSet('validator-1','validator-2','validator-3','validator-4','rpc-1')]
  [string]$NodeName,
  [string]$ProjectRoot = 'C:\Verdex\besu-qbft',
  [string]$NodePrivateKeyFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $env:BESU_HOME) {
  throw 'BESU_HOME is not configured. Run Install-VerdexBesuToolchain.ps1 in a new PowerShell session.'
}
$besuBat = Join-Path $env:BESU_HOME 'bin\besu.bat'
if (-not (Test-Path -LiteralPath $besuBat)) { throw "Besu executable was not found under BESU_HOME: $besuBat" }
$nodeRoot = Join-Path ([System.IO.Path]::GetFullPath($ProjectRoot)) "nodes\$NodeName"
$configName = if ($NodeName -eq 'rpc-1') { 'rpc.toml' } else { 'validator.toml' }
$config = Join-Path $nodeRoot "config\$configName"
if (-not (Test-Path -LiteralPath $config)) { throw "Node configuration is missing: $config" }

$arguments = @("--config-file=$config")
if ($NodeName -ne 'rpc-1') {
  if (-not $NodePrivateKeyFile) {
    throw 'A validator requires -NodePrivateKeyFile pointing to a protected key outside the project tree, or an operator-maintained HSM plugin configuration.'
  }
  $keyPath = [System.IO.Path]::GetFullPath($NodePrivateKeyFile)
  if ($keyPath.StartsWith([System.IO.Path]::GetFullPath($ProjectRoot), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Validator private keys must remain outside the project tree.'
  }
  if (-not (Test-Path -LiteralPath $keyPath)) { throw 'Protected validator key file was not found.' }
  $arguments += "--node-private-key-file=$keyPath"
}

& $besuBat @arguments
exit $LASTEXITCODE
