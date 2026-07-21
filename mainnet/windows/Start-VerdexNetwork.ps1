[CmdletBinding()]
param(
  [string]$ProjectRoot = 'C:\Verdex\besu-qbft',
  [Parameter(Mandatory = $true)]
  [ValidateCount(4, 4)]
  [string[]]$ValidatorKeyFiles,
  [switch]$SkipRpcNode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $env:BESU_HOME) { $env:BESU_HOME = [Environment]::GetEnvironmentVariable('BESU_HOME', 'User') }
if (-not $env:BESU_HOME) { throw 'BESU_HOME is not configured. Run Install-VerdexBesuToolchain.ps1 and open a new PowerShell session.' }
$besuBat = Join-Path $env:BESU_HOME 'bin\besu.bat'
if (-not (Test-Path -LiteralPath $besuBat -PathType Leaf)) { throw "Besu executable was not found: $besuBat" }

$root = [System.IO.Path]::GetFullPath($ProjectRoot)
$statusPath = Join-Path $root 'STATUS.txt'
$genesisPath = Join-Path $root 'network\generated\genesis.json'
if (-not (Test-Path -LiteralPath $genesisPath -PathType Leaf)) {
  throw 'Generated genesis is missing. Run Build-VerdexQbftConfig.ps1 only after the deployment ceremony inputs are complete.'
}

function Assert-ExternalKeyPath([string]$Path, [string]$NodeName) {
  $resolved = [System.IO.Path]::GetFullPath($Path)
  if ($resolved.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$NodeName key path must be outside the project tree."
  }
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "$NodeName key file was not found." }
  return $resolved
}

$nodes = @()
1..4 | ForEach-Object {
  $nodeName = "validator-$_"
  $nodeRoot = Join-Path $root "nodes\$nodeName"
  $config = Join-Path $nodeRoot 'config\validator.toml'
  if (-not (Test-Path -LiteralPath $config -PathType Leaf)) { throw "Missing configuration for $nodeName." }
  $nodes += [pscustomobject]@{
    Name = $nodeName
    Config = $config
    KeyPath = Assert-ExternalKeyPath $ValidatorKeyFiles[$_ - 1] $nodeName
  }
}
if (-not $SkipRpcNode) {
  $rpcConfig = Join-Path $root 'nodes\rpc-1\config\rpc.toml'
  if (-not (Test-Path -LiteralPath $rpcConfig -PathType Leaf)) { throw 'Missing configuration for rpc-1.' }
  $nodes += [pscustomobject]@{ Name = 'rpc-1'; Config = $rpcConfig; KeyPath = $null }
}

foreach ($node in $nodes) {
  $pidPath = Join-Path $root "nodes\$($node.Name)\besu.pid"
  if (Test-Path -LiteralPath $pidPath) {
    $existingPid = (Get-Content -LiteralPath $pidPath -Raw).Trim()
    if ($existingPid -match '^\d+$' -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
      throw "$($node.Name) is already running with PID $existingPid. Stop it before starting another instance."
    }
  }
}

$started = @()
try {
  foreach ($node in $nodes) {
    $nodeRoot = Join-Path $root "nodes\$($node.Name)"
    $outLog = Join-Path $nodeRoot 'logs\besu.stdout.log'
    $errLog = Join-Path $nodeRoot 'logs\besu.stderr.log'
    $arguments = @("--config-file=$($node.Config)")
    if ($node.KeyPath) { $arguments += "--node-private-key-file=$($node.KeyPath)" }
    $process = Start-Process -FilePath $besuBat -ArgumentList $arguments -PassThru -WindowStyle Hidden `
      -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    Set-Content -LiteralPath (Join-Path $nodeRoot 'besu.pid') -Value $process.Id -Encoding ASCII -NoNewline
    $started += $process
    Start-Sleep -Seconds 1
  }
} catch {
  foreach ($process in $started) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  throw
}

Set-Content -LiteralPath $statusPath -Value 'RUNNING_LOCAL_REHEARSAL_NOT_MAINNET' -Encoding ASCII -NoNewline
[pscustomobject]@{
  Status = 'RUNNING_LOCAL_REHEARSAL_NOT_MAINNET'
  StartedNodes = $nodes.Name
  RpcEndpoint = if ($SkipRpcNode) { $null } else { 'http://127.0.0.1:8545' }
  MetricsEndpoints = @('http://127.0.0.1:9545/metrics','http://127.0.0.1:9546/metrics','http://127.0.0.1:9547/metrics','http://127.0.0.1:9548/metrics','http://127.0.0.1:9549/metrics')
} | Format-List
