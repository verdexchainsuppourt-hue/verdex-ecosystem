[CmdletBinding()]
param(
  [string]$ProjectRoot = 'C:\Verdex\besu-qbft'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$resolvedRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
if ($resolvedRoot -notmatch '^[A-Za-z]:\\Verdex(?:\\|$)') {
  throw 'ProjectRoot must be an explicit path inside C:\Verdex.'
}
if (Test-Path -LiteralPath $resolvedRoot) {
  $existing = @(Get-ChildItem -LiteralPath $resolvedRoot -Force -ErrorAction SilentlyContinue)
  if ($existing.Count -gt 0) { throw 'ProjectRoot already exists and is not empty; refusing to overwrite it.' }
}

$directories = @(
  'network\inputs', 'network\generated', 'network\evidence', 'logs',
  'nodes\rpc-1\data', 'nodes\rpc-1\logs', 'nodes\rpc-1\config'
)
1..4 | ForEach-Object {
  $directories += "nodes\validator-$_\data"
  $directories += "nodes\validator-$_\logs"
  $directories += "nodes\validator-$_\config"
  $directories += "nodes\validator-$_\secure-key-reference"
}
foreach ($relative in $directories) {
  New-Item -ItemType Directory -Path (Join-Path $resolvedRoot $relative) -Force | Out-Null
}

$templateRoot = Split-Path $PSScriptRoot -Parent
Copy-Item -LiteralPath (Join-Path $templateRoot 'besu\DEPLOYMENT_INPUTS.template.json') `
  -Destination (Join-Path $resolvedRoot 'network\inputs\DEPLOYMENT_INPUTS.template.json')

$keyNotice = @'
NO PRIVATE KEY BELONGS IN THIS DIRECTORY.

Each validator operator must configure a hardware-backed signer or a protected
local key file outside the project tree. Pass only its path to Start-VerdexNode.ps1.
Never commit, email, upload, or paste a validator private key.
'@
1..4 | ForEach-Object {
  Set-Content -LiteralPath (Join-Path $resolvedRoot "nodes\validator-$_\secure-key-reference\README.txt") `
    -Value $keyNotice -Encoding UTF8 -NoNewline
}

Set-Content -LiteralPath (Join-Path $resolvedRoot 'STATUS.txt') `
  -Value 'SCAFFOLDED_NOT_CONFIGURED_NOT_SIGNED_NOT_DEPLOYED' -Encoding ASCII -NoNewline

[pscustomobject]@{
  ProjectRoot = $resolvedRoot
  Validators = 4
  RpcNodes = 1
  Status = 'SCAFFOLDED_NOT_CONFIGURED_NOT_SIGNED_NOT_DEPLOYED'
} | Format-List

