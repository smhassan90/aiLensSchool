# Scans .keystore / .jks files for the Play upload SHA-1 (no passwords written to disk).
param(
  [string]$Root = "D:\workspace",
  [int]$MaxDepth = 10
)

$ErrorActionPreference = "Continue"
$ExpectedSha1 = "FE:95:D9:5F:11:9F:BE:5E:A9:59:76:1F:83:A6:23:CE:51:69:61:93"
$passwords = @("android")
if ($env:PLAY_UPLOAD_STORE_PASSWORD) {
  $passwords += $env:PLAY_UPLOAD_STORE_PASSWORD
}

$keytool = if (Test-Path "$env:JAVA_HOME\bin\keytool.exe") {
  "$env:JAVA_HOME\bin\keytool.exe"
} else {
  "keytool"
}

$files = Get-ChildItem -Path $Root -Recurse -Include *.keystore, *.jks -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch 'node_modules|\.gradle|\\Temp\\' } |
  Select-Object -First 200

Write-Host "Scanning $($files.Count) keystore files under $Root (depth $MaxDepth)..."

foreach ($f in $files) {
  foreach ($pass in $passwords | Select-Object -Unique) {
    $out = & $keytool -list -v -keystore $f.FullName -storepass $pass 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { continue }
    $matches = [regex]::Matches($out, 'SHA1:\s*([0-9A-F:]+)')
    foreach ($m in $matches) {
      if ($m.Groups[1].Value -eq $ExpectedSha1) {
        Write-Host ""
        Write-Host "MATCH: $($f.FullName)" -ForegroundColor Green
        Write-Host "  (store password worked: $($pass -ne 'android'))"
        exit 0
      }
    }
    break
  }
}

Write-Host "No keystore matched $ExpectedSha1 with tried passwords."
Write-Host "Try: set PLAY_UPLOAD_STORE_PASSWORD and run again, or search backups / EAS credentials."
