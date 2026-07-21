[CmdletBinding()]
param(
  [string]$ProjectRoot = 'C:\Verdex\besu-qbft'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
  $output = $process.StandardOutput.ReadToEnd() + $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "$FilePath exited with code $($process.ExitCode): $output" }
  return $output.Trim()
}

$java21Home = [Environment]::GetEnvironmentVariable('VERDEX_JAVA21_HOME', 'User')
$javaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
$besuHome = [Environment]::GetEnvironmentVariable('BESU_HOME', 'User')
foreach ($required in @(
  @{ Name = 'VERDEX_JAVA21_HOME'; Value = $java21Home },
  @{ Name = 'JAVA_HOME'; Value = $javaHome },
  @{ Name = 'BESU_HOME'; Value = $besuHome }
)) {
  if (-not $required.Value) { throw "$($required.Name) is not configured at user scope." }
}

$java21Exe = Join-Path $java21Home 'bin\java.exe'
$besuJavaExe = Join-Path $javaHome 'bin\java.exe'
$besuBat = Join-Path $besuHome 'bin\besu.bat'
foreach ($file in @($java21Exe, $besuJavaExe, $besuBat)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required executable is missing: $file" }
}

$originalJavaHome = $env:JAVA_HOME
try {
  $env:JAVA_HOME = $javaHome
  $java21Version = Invoke-NativeCapture $java21Exe '-version'
  $besuJavaVersion = Invoke-NativeCapture $besuJavaExe '-version'
  $besuVersion = Invoke-NativeCapture $besuBat '--version'
} finally {
  $env:JAVA_HOME = $originalJavaHome
}
if ($java21Version -notmatch 'version\s+"21') { throw 'VERDEX_JAVA21_HOME does not point to Java 21.' }
if ($besuJavaVersion -notmatch 'version\s+"25') { throw 'JAVA_HOME does not point to the Java 25 runtime required by current Besu.' }
if ($besuVersion -notmatch '^besu/v') { throw 'Besu version output was not recognized.' }

$statusPath = Join-Path ([System.IO.Path]::GetFullPath($ProjectRoot)) 'STATUS.txt'
$projectStatus = if (Test-Path -LiteralPath $statusPath) { Get-Content -LiteralPath $statusPath -Raw } else { 'PROJECT_NOT_INITIALIZED' }
[pscustomobject]@{
  Java21 = ($java21Version -split "`r?`n")[0]
  BesuJava = ($besuJavaVersion -split "`r?`n")[0]
  Besu = $besuVersion
  ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
  ProjectStatus = $projectStatus.Trim()
} | Format-List
