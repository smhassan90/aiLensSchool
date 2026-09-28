$ErrorActionPreference = "Stop"

$mobileRoot = Split-Path -Parent $PSScriptRoot
$shaFile = Join-Path $mobileRoot "signing\expected-upload-sha1.txt"
$ExpectedSha1 = "FE:95:D9:5F:11:9F:BE:5E:A9:59:76:1F:83:A6:23:CE:51:69:61:93"
if (Test-Path $shaFile) {
  $ExpectedSha1 = (Get-Content $shaFile -Raw).Trim()
}
$keystore = Join-Path $mobileRoot "signing\play-upload.keystore"
$propsFile = Join-Path $mobileRoot "signing\play-upload.properties"

if (-not (Test-Path $keystore)) {
  throw "Keystore not found: $keystore"
}
if (-not (Test-Path $propsFile)) {
  throw "Properties not found: $propsFile"
}

$map = @{}
Get-Content $propsFile | ForEach-Object {
  if ($_ -match '^\s*#' -or -not ($_ -match '\S')) { return }
  $idx = $_.IndexOf('=')
  if ($idx -gt 0) {
    $map[$_.Substring(0, $idx).Trim()] = $_.Substring($idx + 1).Trim()
  }
}

$storePass = $map['storePassword']
$alias = $map['keyAlias']
if (-not $storePass -or -not $alias) {
  throw "play-upload.properties needs storePassword and keyAlias"
}

$keytool = if (Test-Path "$env:JAVA_HOME\bin\keytool.exe") {
  "$env:JAVA_HOME\bin\keytool.exe"
} else {
  "keytool"
}

$out = & $keytool -list -v -keystore $keystore -storepass $storePass -alias $alias 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
  throw "keytool failed. Check store password and key alias.`n$out"
}

$m = [regex]::Match($out, 'SHA1:\s*([0-9A-F:]+)')
if (-not $m.Success) {
  throw "Could not read SHA1 from keystore.`n$out"
}

$sha1 = $m.Groups[1].Value
Write-Host "Keystore SHA1: $sha1"

if ($sha1 -ne $ExpectedSha1) {
  throw @"
This keystore is NOT the Play upload key.

Expected: $ExpectedSha1
Actual:   $sha1

Use the original upload keystore or request an upload key reset in Play Console.
See mobile/signing/README.md
"@
}

Write-Host "Upload certificate matches Google Play." -ForegroundColor Green
