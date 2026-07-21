[CmdletBinding()]
param(
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Verdex\toolchain')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Invoke-NativeCapture([string]$FilePath, [string]$Arguments) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.Arguments = $Arguments
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw "Unable to start $FilePath." }
  $standardOutput = $process.StandardOutput.ReadToEnd()
  $standardError = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "$FilePath exited with code $($process.ExitCode): $standardError"
  }
  return "$standardOutput$standardError"
}

function Get-JavaExecutable([int]$MajorVersion) {
  $candidates = @()
  $javaCommand = Get-Command java.exe -ErrorAction SilentlyContinue
  if ($javaCommand) { $candidates += $javaCommand.Source }
  foreach ($base in @(
    (Join-Path $env:ProgramFiles 'Eclipse Adoptium'),
    (Join-Path $env:ProgramFiles 'Microsoft')
  )) {
    if (Test-Path -LiteralPath $base) {
      $candidates += Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue |
        Where-Object Name -Like "jdk-$MajorVersion*" |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'bin\java.exe' }
    }
  }
  foreach ($candidate in $candidates | Select-Object -Unique) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $versionText = Invoke-NativeCapture $candidate '-version'
    $versionMatch = [regex]::Match($versionText, 'version\s+"(?<major>\d+)(?:\.|")')
    if ($versionMatch.Success -and [int]$versionMatch.Groups['major'].Value -eq $MajorVersion) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  return $null
}

function Install-JavaMajor([int]$MajorVersion) {
  $javaExe = Get-JavaExecutable $MajorVersion
  if ($javaExe) { return $javaExe }
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw "winget is required to install Java $MajorVersion automatically."
  }
  $packageId = "EclipseAdoptium.Temurin.$MajorVersion.JDK"
  & winget.exe install --id $packageId --exact --source winget `
    --accept-package-agreements --accept-source-agreements --silent
  if ($LASTEXITCODE -ne 0) {
    throw "Java $MajorVersion installation failed with exit code $LASTEXITCODE."
  }
  foreach ($attempt in 1..10) {
    $javaExe = Get-JavaExecutable $MajorVersion
    if ($javaExe) { break }
    Start-Sleep -Seconds 2
  }
  if (-not $javaExe) { throw "Java $MajorVersion was installed but could not be located." }
  return $javaExe
}

function Add-UserPathEntry([string]$Entry) {
  $resolved = [System.IO.Path]::GetFullPath($Entry).TrimEnd('\')
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @($current -split ';' | Where-Object { $_ -and $_.Trim() })
  if (-not ($parts | Where-Object { $_.TrimEnd('\') -ieq $resolved })) {
    [Environment]::SetEnvironmentVariable('Path', (($parts + $resolved) -join ';'), 'User')
  }
  if (-not (($env:Path -split ';') | Where-Object { $_.TrimEnd('\') -ieq $resolved })) {
    $env:Path = "$resolved;$env:Path"
  }
}

$java21Exe = Install-JavaMajor 21
$java21Home = Split-Path (Split-Path $java21Exe -Parent) -Parent
[Environment]::SetEnvironmentVariable('VERDEX_JAVA21_HOME', $java21Home, 'User')

# Current Besu is compiled for Java class version 69, which requires Java 25.
# Keep Java 21 available for the requested toolchain, but run Besu on Java 25.
$besuJavaExe = Install-JavaMajor 25
$besuJavaHome = Split-Path (Split-Path $besuJavaExe -Parent) -Parent
[Environment]::SetEnvironmentVariable('JAVA_HOME', $besuJavaHome, 'User')
$env:JAVA_HOME = $besuJavaHome
Add-UserPathEntry (Join-Path $besuJavaHome 'bin')

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$cacheRoot = Join-Path $InstallRoot 'downloads'
New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null

$headers = @{ 'User-Agent' = 'Verdex-Windows-Besu-Installer'; 'Accept' = 'application/vnd.github+json' }
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/besu-eth/besu/releases/latest' -Headers $headers
$zipAsset = @($release.assets | Where-Object { $_.name -match '^besu-[0-9].*\.zip$' }) | Select-Object -First 1
if (-not $zipAsset) { throw 'The latest official Besu release did not include a ZIP distribution.' }

$escapedName = [regex]::Escape([string]$zipAsset.name)
$checksumMatch = [regex]::Match([string]$release.body, "(?im)^\s*([a-f0-9]{64})\s+\*?$escapedName\s*$")
if (-not $checksumMatch.Success) {
  throw 'The official release notes did not publish a SHA-256 for the ZIP. Refusing an unverified download.'
}
$expectedSha256 = $checksumMatch.Groups[1].Value.ToLowerInvariant()
$zipPath = Join-Path $cacheRoot $zipAsset.name
if (-not (Test-Path -LiteralPath $zipPath)) {
  Invoke-WebRequest -Uri $zipAsset.browser_download_url -Headers $headers -OutFile $zipPath
}
$actualSha256 = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSha256 -ne $expectedSha256) { throw 'Downloaded Besu ZIP failed SHA-256 verification.' }

$version = ([string]$release.tag_name).TrimStart('v')
$besuHome = Join-Path $InstallRoot "besu-$version"
if (-not (Test-Path -LiteralPath $besuHome)) {
  Expand-Archive -LiteralPath $zipPath -DestinationPath $InstallRoot
}
$besuBat = Get-ChildItem -LiteralPath $besuHome -Filter besu.bat -Recurse -File | Select-Object -First 1
if (-not $besuBat) { throw 'Besu was extracted but bin\besu.bat was not found.' }
$besuHome = Split-Path (Split-Path $besuBat.FullName -Parent) -Parent
[Environment]::SetEnvironmentVariable('BESU_HOME', $besuHome, 'User')
$env:BESU_HOME = $besuHome
Add-UserPathEntry (Join-Path $besuHome 'bin')

$java21Version = (Invoke-NativeCapture $java21Exe '-version').Trim()
$besuJavaVersion = (Invoke-NativeCapture $besuJavaExe '-version').Trim()
$besuVersion = (Invoke-NativeCapture $besuBat.FullName '--version').Trim()
[pscustomobject]@{
  Java21Home = $java21Home
  Java21Version = $java21Version
  BesuJavaHome = $besuJavaHome
  BesuJavaVersion = $besuJavaVersion
  BesuHome = $besuHome
  BesuVersion = $besuVersion
  BesuZipSha256 = $actualSha256
} | Format-List
