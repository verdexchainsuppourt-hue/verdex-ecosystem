[CmdletBinding()]
param(
  [string]$RpcUrl = 'http://127.0.0.1:8545',
  [int]$ExpectedChainId = 72010,
  [ValidateRange(0, 1000)]
  [int]$MinimumPeerCount = 4,
  [ValidateRange(5, 60)]
  [int]$BlockObservationSeconds = 12
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$chainIdHex = $null
$networkId = $null
$firstBlockHex = $null
$secondBlockHex = $null
$peers = @()

function Invoke-VerdexRpc([string]$Method, [object[]]$Parameters = @()) {
  $request = @{ jsonrpc = '2.0'; id = 1; method = $Method; params = $Parameters } | ConvertTo-Json -Compress
  $response = Invoke-RestMethod -Uri $RpcUrl -Method Post -ContentType 'application/json' -Body $request -TimeoutSec 15
  if ($response.error) { throw "JSON-RPC $Method failed: $($response.error.message)" }
  return $response.result
}

$failures = @()
try { $chainIdHex = Invoke-VerdexRpc 'eth_chainId' } catch { $failures += $_.Exception.Message }
try { $networkId = Invoke-VerdexRpc 'net_version' } catch { $failures += $_.Exception.Message }
try { $firstBlockHex = Invoke-VerdexRpc 'eth_blockNumber' } catch { $failures += $_.Exception.Message }
try { $peers = @(Invoke-VerdexRpc 'admin_peers') } catch { $failures += $_.Exception.Message }

if (-not $failures.Count) {
  $actualChainId = [Convert]::ToInt64($chainIdHex.Substring(2), 16)
  if ($actualChainId -ne $ExpectedChainId) { $failures += "Expected chain ID $ExpectedChainId, received $actualChainId." }
  if ($networkId -ne "$ExpectedChainId") { $failures += "Expected network ID $ExpectedChainId, received $networkId." }
  if ($peers.Count -lt $MinimumPeerCount) { $failures += "Expected at least $MinimumPeerCount peers, received $($peers.Count)." }
  Start-Sleep -Seconds $BlockObservationSeconds
  try {
    $secondBlockHex = Invoke-VerdexRpc 'eth_blockNumber'
    $firstBlock = [Convert]::ToInt64($firstBlockHex.Substring(2), 16)
    $secondBlock = [Convert]::ToInt64($secondBlockHex.Substring(2), 16)
    if ($secondBlock -le $firstBlock) { $failures += "Block height did not advance during $BlockObservationSeconds seconds." }
  } catch { $failures += $_.Exception.Message }
}

$metrics = @()
foreach ($port in 9545..9549) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/metrics" -UseBasicParsing -TimeoutSec 5
    $metrics += [pscustomobject]@{ Port = $port; Available = ($response.StatusCode -eq 200) }
  } catch {
    $metrics += [pscustomobject]@{ Port = $port; Available = $false }
    $failures += "Metrics endpoint $port is unavailable."
  }
}

$result = [pscustomobject]@{
  RpcUrl = $RpcUrl
  ChainId = $chainIdHex
  NetworkId = $networkId
  InitialBlock = $firstBlockHex
  FinalBlock = $secondBlockHex
  PeerCount = $peers.Count
  Metrics = $metrics
  Healthy = ($failures.Count -eq 0)
  Failures = $failures
}
$result | Format-List
if ($failures.Count) { exit 1 }
