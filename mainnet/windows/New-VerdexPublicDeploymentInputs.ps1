[CmdletBinding()]
param(
  [string]$ProjectRoot = 'C:\Verdex\besu-qbft',
  [ValidateCount(4, 4)]
  [string[]]$ValidatorAddresses = @(
    '0xcc90d8222b93859a1ec371a3acd21ae2f35ed383',
    '0x34cb2a1c8888ad2ea5873399ccd77752f19d145f',
    '0x8f3feca25502cc82fd4ed85a6f9052060bce9393',
    '0x615c249379a42094bfdbde29e0c0d8e821e5a1b5'
  ),
  [Parameter(Mandatory = $true)]
  [ValidateCount(4, 4)]
  [string[]]$ValidatorPublicKeys,
  [Parameter(Mandatory = $true)]
  [ValidateCount(4, 4)]
  [string[]]$ValidatorHosts,
  [ValidateCount(4, 4)]
  [int[]]$P2pPorts = @(30303, 30304, 30305, 30306),
  [Parameter(Mandatory = $true)]
  [string]$GasTreasuryAddress,
  [Parameter(Mandatory = $true)]
  [string]$GasTreasuryBalanceHex,
  [Parameter(Mandatory = $true)]
  [string]$DeployerAddress,
  [Parameter(Mandatory = $true)]
  [string]$DeployerBalanceHex,
  [Parameter(Mandatory = $true)]
  [Int64]$GenesisTimestampUnixSeconds,
  [string]$RpcHostname = 'rpc.verdexswap.site',
  [string]$RateLimitOwner = 'Verdex Mainnet Operations'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Normalize-Address([string]$Value, [string]$Name) {
  $address = $Value.Trim().ToLowerInvariant()
  if ($address -notmatch '^0x[0-9a-f]{40}$') { throw "$Name must be a public EVM address." }
  return $address
}

function Normalize-NodePublicKey([string]$Value, [string]$Name) {
  $key = $Value.Trim().ToLowerInvariant() -replace '^0x', ''
  if ($key -notmatch '^[0-9a-f]{128}$') {
    throw "$Name must be the 128-hex-character public node key emitted by 'besu public-key export'."
  }
  return $key
}

function Normalize-Host([string]$Value, [string]$Name) {
  $hostName = $Value.Trim().ToLowerInvariant().TrimEnd('.')
  if ($hostName -notmatch '^(?:[a-z0-9-]+\.)+[a-z]{2,63}$') {
    throw "$Name must be a public DNS hostname, not an IP address, URL, or localhost."
  }
  return $hostName
}

function Normalize-HexBalance([string]$Value, [string]$Name) {
  $balance = $Value.Trim().ToLowerInvariant()
  if ($balance -notmatch '^0x[1-9a-f][0-9a-f]*$') { throw "$Name must be a non-zero hexadecimal native-gas allocation." }
  return $balance
}

if ($GenesisTimestampUnixSeconds -lt ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 300)) {
  throw 'GenesisTimestampUnixSeconds must be at least five minutes in the future.'
}
if ([string]::IsNullOrWhiteSpace($RateLimitOwner)) { throw 'RateLimitOwner is required.' }

$root = [System.IO.Path]::GetFullPath($ProjectRoot)
$inputsDir = Join-Path $root 'network\inputs'
$templatePath = Join-Path $inputsDir 'DEPLOYMENT_INPUTS.template.json'
$outputPath = Join-Path $inputsDir 'DEPLOYMENT_INPUTS.json'
if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) {
  throw "Template not found. Run Initialize-VerdexBesuProject.ps1 first: $templatePath"
}
if (Test-Path -LiteralPath $outputPath -PathType Leaf) {
  throw "Refusing to overwrite existing deployment inputs: $outputPath"
}

$addresses = @()
$publicKeys = @()
$hosts = @()
for ($index = 0; $index -lt 4; $index++) {
  if ($P2pPorts[$index] -lt 1 -or $P2pPorts[$index] -gt 65535) { throw "P2pPorts[$index] is invalid." }
  $addresses += Normalize-Address $ValidatorAddresses[$index] "ValidatorAddresses[$index]"
  $publicKeys += Normalize-NodePublicKey $ValidatorPublicKeys[$index] "ValidatorPublicKeys[$index]"
  $hosts += Normalize-Host $ValidatorHosts[$index] "ValidatorHosts[$index]"
}
if ((@($addresses | Select-Object -Unique)).Count -ne 4) { throw 'Validator addresses must be distinct.' }
if ((@($publicKeys | Select-Object -Unique)).Count -ne 4) { throw 'Validator public node keys must be distinct.' }
if ((@($hosts | Select-Object -Unique)).Count -ne 4) { throw 'Validator hostnames must be distinct.' }

$treasury = Normalize-Address $GasTreasuryAddress 'GasTreasuryAddress'
$deployer = Normalize-Address $DeployerAddress 'DeployerAddress'
if ($treasury -eq $deployer) { throw 'GasTreasuryAddress and DeployerAddress must be distinct.' }
$rpcHost = Normalize-Host $RpcHostname 'RpcHostname'

$input = Get-Content -LiteralPath $templatePath -Raw | ConvertFrom-Json
$input.status = 'READY_FOR_DEPLOYMENT_REVIEW'
$input.genesisTimestampUnixSeconds = $GenesisTimestampUnixSeconds
$input.validatorAddresses = $addresses
$input.bootnodes = @(for ($index = 0; $index -lt 4; $index++) {
  "enode://$($publicKeys[$index])@$($hosts[$index]):$($P2pPorts[$index])"
})
$input.nativeGasAllocations = @(
  [pscustomobject]@{ address = $treasury; balanceHex = (Normalize-HexBalance $GasTreasuryBalanceHex 'GasTreasuryBalanceHex') },
  [pscustomobject]@{ address = $deployer; balanceHex = (Normalize-HexBalance $DeployerBalanceHex 'DeployerBalanceHex') }
)
$input.publicRpc.hostAllowlist = @($rpcHost)
$input.publicRpc.corsOrigins = @('https://verdexswap.site')
$input.publicRpc.rateLimitOwner = $RateLimitOwner.Trim()

$input | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputPath -Encoding UTF8 -NoNewline
$hash = Get-FileHash -LiteralPath $outputPath -Algorithm SHA256

[pscustomobject]@{
  Status = 'READY_FOR_DEPLOYMENT_REVIEW'
  OutputPath = $outputPath
  ValidatorAddresses = $addresses
  Bootnodes = $input.bootnodes
  RpcHostname = $rpcHost
  InputSha256 = $hash.Hash.ToLowerInvariant()
} | Format-List
