param(
  [Parameter(Mandatory = $true)]
  [string]$AabPath
)

$ErrorActionPreference = "Stop"
$mobileRoot = Split-Path -Parent $PSScriptRoot
$shaFile = Join-Path $mobileRoot "signing\expected-upload-sha1.txt"
$ExpectedSha1 = "FE:95:D9:5F:11:9F:BE:5E:A9:59:76:1F:83:A6:23:CE:51:69:61:93"
if (Test-Path $shaFile) {
  $ExpectedSha1 = (Get-Content $shaFile -Raw).Trim()
}

if (-not (Test-Path $AabPath)) {
  throw "AAB not found: $AabPath"
}

$keytool = if (Test-Path "$env:JAVA_HOME\bin\keytool.exe") {
  "$env:JAVA_HOME\bin\keytool.exe"
} else {
  "keytool"
}

$out = & $keytool -printcert -jarfile $AabPath 2>&1 | Out-String
$m = [regex]::Match($out, 'SHA1:\s*([0-9A-F:]+)')
if (-not $m.Success) {
  throw "Could not read certificate from AAB.`n$out"
}

$sha1 = $m.Groups[1].Value
Write-Host "AAB SHA1: $sha1"

if ($sha1 -ne $ExpectedSha1) {
  throw "AAB is signed with the wrong key. Expected $ExpectedSha1"
}

Write-Host "AAB upload certificate OK for Play." -ForegroundColor Green
