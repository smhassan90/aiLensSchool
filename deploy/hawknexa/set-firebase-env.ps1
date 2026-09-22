# Write FIREBASE_SERVICE_ACCOUNT_JSON into a deploy .env from the mobile service-account key.
param(
  [string]$JsonFile = "",
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$mobileDir = Join-Path $repoRoot "mobile"
$defaultEnvFile = Join-Path $PSScriptRoot ".env"

if (-not $JsonFile) {
  $JsonFile = Get-ChildItem -Path $mobileDir -Filter "*firebase-adminsdk*.json" -File |
    Select-Object -First 1 -ExpandProperty FullName
}

if (-not $JsonFile -or -not (Test-Path $JsonFile)) {
  throw "Firebase service-account JSON not found in $mobileDir"
}

if (-not $EnvFile) {
  $EnvFile = $defaultEnvFile
}

$serviceAccount = Get-Content -Raw -Path $JsonFile | ConvertFrom-Json
$inlineJson = ($serviceAccount | ConvertTo-Json -Compress -Depth 20)
$key = "FIREBASE_SERVICE_ACCOUNT_JSON"

if (Test-Path $EnvFile) {
  $lines = Get-Content -Path $EnvFile
  $updated = $false
  $out = @()
  foreach ($line in $lines) {
    if ($line.StartsWith("$key=")) {
      $out += "$key=$inlineJson"
      $updated = $true
    } else {
      $out += $line
    }
  }
  if (-not $updated) {
    if ($out.Count -gt 0 -and $out[-1].Trim()) {
      $out += ""
    }
    $out += "$key=$inlineJson"
  }
  Set-Content -Path $EnvFile -Value $out -Encoding utf8
} else {
  Set-Content -Path $EnvFile -Value "$key=$inlineJson" -Encoding utf8
}

Write-Host "Updated $EnvFile with FIREBASE_SERVICE_ACCOUNT_JSON"
Write-Host "  source: $JsonFile"
Write-Host "  project_id: $($serviceAccount.project_id)"
