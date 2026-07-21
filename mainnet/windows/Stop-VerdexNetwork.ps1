[CmdletBinding()]
param(
  [string]$ProjectRoot = 'C:\Verdex\besu-qbft'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($ProjectRoot)
$stopped = @()
foreach ($nodeName in @('validator-1','validator-2','validator-3','validator-4','rpc-1')) {
  $pidPath = Join-Path $root "nodes\$nodeName\besu.pid"
  if (-not (Test-Path -LiteralPath $pidPath -PathType Leaf)) { continue }
  $pidValue = (Get-Content -LiteralPath $pidPath -Raw).Trim()
  if ($pidValue -match '^\d+$') {
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $process.Id -ErrorAction Stop
      $stopped += [pscustomobject]@{ Node = $nodeName; Pid = $process.Id }
    }
  }
  Remove-Item -LiteralPath $pidPath -Force
}

$statusPath = Join-Path $root 'STATUS.txt'
if (Test-Path -LiteralPath $statusPath) {
  Set-Content -LiteralPath $statusPath -Value 'CONFIGURED_STOPPED_NOT_DEPLOYED' -Encoding ASCII -NoNewline
}
$stopped | Format-Table -AutoSize
