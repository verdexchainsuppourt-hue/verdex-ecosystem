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
& (Join-Path $PSScriptRoot 'Stop-VerdexNetwork.ps1') -ProjectRoot $ProjectRoot
& (Join-Path $PSScriptRoot 'Start-VerdexNetwork.ps1') -ProjectRoot $ProjectRoot -ValidatorKeyFiles $ValidatorKeyFiles -SkipRpcNode:$SkipRpcNode
