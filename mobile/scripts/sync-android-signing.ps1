$ErrorActionPreference = "Stop"

$mobileRoot = Split-Path -Parent $PSScriptRoot
$signingDir = Join-Path $mobileRoot "signing"
$propsSrc = Join-Path $signingDir "play-upload.properties"
$keystoreSrc = Join-Path $signingDir "play-upload.keystore"
$androidDir = Join-Path $mobileRoot "android"
$propsDst = Join-Path $androidDir "keystore.properties"

if (-not (Test-Path $keystoreSrc)) {
  throw @"
Play upload keystore not found: $keystoreSrc

Place your Play upload .keystore at mobile/signing/play-upload.keystore
See mobile/signing/README.md
"@
}

if (-not (Test-Path $propsSrc)) {
  throw @"
Missing $propsSrc

Copy mobile/signing/play-upload.properties.example to play-upload.properties and set passwords and key alias.
"@
}

$lines = Get-Content $propsSrc | Where-Object { $_ -match '\S' -and $_ -notmatch '^\s*#' }
$map = @{}
foreach ($line in $lines) {
  $idx = $line.IndexOf('=')
  if ($idx -lt 1) { continue }
  $key = $line.Substring(0, $idx).Trim()
  $val = $line.Substring($idx + 1).Trim()
  $map[$key] = $val
}

foreach ($required in @('storePassword', 'keyAlias', 'keyPassword')) {
  if (-not $map.ContainsKey($required) -or -not $map[$required]) {
    throw "play-upload.properties must set $required"
  }
}

if (-not (Test-Path $androidDir)) {
  throw "Android project not found at $androidDir. Run: npx expo prebuild --platform android"
}

# storeFile path is relative to android/app/ (see app/build.gradle)
$out = @(
  "storeFile=../../signing/play-upload.keystore"
  "storePassword=$($map['storePassword'])"
  "keyAlias=$($map['keyAlias'])"
  "keyPassword=$($map['keyPassword'])"
) -join "`n"

[System.IO.File]::WriteAllText($propsDst, $out + "`n")
Write-Host "Wrote $propsDst (UTF-8, no BOM)" -ForegroundColor Green
