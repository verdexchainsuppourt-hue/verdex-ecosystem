[CmdletBinding()]
param(
  [string]$ProjectRoot = 'C:\Verdex\besu-qbft',
  [string]$InputFile = 'C:\Verdex\besu-qbft\network\inputs\DEPLOYMENT_INPUTS.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$project = [System.IO.Path]::GetFullPath($ProjectRoot)
$input = [System.IO.Path]::GetFullPath($InputFile)
$generated = Join-Path $project 'network\generated'
if (-not (Test-Path -LiteralPath $input)) { throw 'Filled DEPLOYMENT_INPUTS.json is missing.' }
if (Test-Path -LiteralPath (Join-Path $generated 'genesis.json')) {
  throw 'A generated genesis already exists; refusing to overwrite release configuration.'
}
$generator = Join-Path (Split-Path $PSScriptRoot -Parent) 'besu\create-qbft-release-config.js'
if (-not (Test-Path -LiteralPath $generator)) { throw 'QBFT configuration generator is missing.' }
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js is required for deterministic configuration generation.' }

# The generator requires an output directory that does not exist.
if (Test-Path -LiteralPath $generated) {
  $children = @(Get-ChildItem -LiteralPath $generated -Force)
  if ($children.Count -gt 0) { throw 'Generated output directory is not empty.' }
  Remove-Item -LiteralPath $generated
}
& node.exe $generator $input $generated
if ($LASTEXITCODE -ne 0) { throw "QBFT configuration generation failed with exit code $LASTEXITCODE." }

$genesis = Join-Path $generated 'genesis.json'
$validatorTemplate = Join-Path $generated 'validator.toml'
$rpcTemplate = Join-Path $generated 'rpc.toml'
$staticNodes = Join-Path $generated 'static-nodes.json'
$permissions = Join-Path $generated 'permissions_config.toml'
if (-not (Test-Path -LiteralPath $genesis) -or -not (Test-Path -LiteralPath $validatorTemplate) -or
    -not (Test-Path -LiteralPath $staticNodes) -or -not (Test-Path -LiteralPath $permissions)) {
  throw 'Generator did not produce the required files.'
}

function Convert-ToTomlPath([string]$Path) { return ([System.IO.Path]::GetFullPath($Path) -replace '\\', '/') }
1..4 | ForEach-Object {
  $nodeRoot = Join-Path $project "nodes\validator-$_"
  $body = Get-Content -LiteralPath $validatorTemplate -Raw
  $body = $body -replace 'data-path="[^"]+"', ('data-path="' + (Convert-ToTomlPath (Join-Path $nodeRoot 'data')) + '"')
  $body = $body -replace 'genesis-file="[^"]+"', ('genesis-file="' + (Convert-ToTomlPath $genesis) + '"')
  $body = $body -replace 'static-nodes-file="[^"]+"', ('static-nodes-file="' + (Convert-ToTomlPath (Join-Path $nodeRoot 'data\static-nodes.json')) + '"')
  $body = $body -replace 'permissions-nodes-config-file="[^"]+"', ('permissions-nodes-config-file="' + (Convert-ToTomlPath (Join-Path $nodeRoot 'data\permissions_config.toml')) + '"')
  $body = $body -replace 'p2p-port=30303', ('p2p-port=' + (30302 + $_))
  $body = $body -replace 'metrics-port=9545', ('metrics-port=' + (9544 + $_))
  Set-Content -LiteralPath (Join-Path $nodeRoot 'config\validator.toml') -Value $body -Encoding UTF8 -NoNewline
  Copy-Item -LiteralPath $staticNodes -Destination (Join-Path $nodeRoot 'data\static-nodes.json')
  Copy-Item -LiteralPath $permissions -Destination (Join-Path $nodeRoot 'data\permissions_config.toml')
}
$rpcRoot = Join-Path $project 'nodes\rpc-1'
$rpcBody = Get-Content -LiteralPath $rpcTemplate -Raw
$rpcBody = $rpcBody -replace 'data-path="[^"]+"', ('data-path="' + (Convert-ToTomlPath (Join-Path $rpcRoot 'data')) + '"')
$rpcBody = $rpcBody -replace 'genesis-file="[^"]+"', ('genesis-file="' + (Convert-ToTomlPath $genesis) + '"')
$rpcBody = $rpcBody -replace 'static-nodes-file="[^"]+"', ('static-nodes-file="' + (Convert-ToTomlPath (Join-Path $rpcRoot 'data\static-nodes.json')) + '"')
$rpcBody = $rpcBody -replace 'permissions-nodes-config-file="[^"]+"', ('permissions-nodes-config-file="' + (Convert-ToTomlPath (Join-Path $rpcRoot 'data\permissions_config.toml')) + '"')
$rpcBody = $rpcBody -replace 'p2p-port=30303', 'p2p-port=30307'
$rpcBody = $rpcBody -replace 'metrics-port=9545', 'metrics-port=9549'
Set-Content -LiteralPath (Join-Path $rpcRoot 'config\rpc.toml') -Value $rpcBody -Encoding UTF8 -NoNewline
Copy-Item -LiteralPath $staticNodes -Destination (Join-Path $rpcRoot 'data\static-nodes.json')
Copy-Item -LiteralPath $permissions -Destination (Join-Path $rpcRoot 'data\permissions_config.toml')
Set-Content -LiteralPath (Join-Path $project 'STATUS.txt') `
  -Value 'CONFIGURED_NOT_SIGNED_NOT_STARTED_NOT_DEPLOYED' -Encoding ASCII -NoNewline

Get-FileHash -LiteralPath $genesis -Algorithm SHA256 | Format-List
