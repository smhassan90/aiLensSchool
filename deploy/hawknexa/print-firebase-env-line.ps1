# Print the FIREBASE_SERVICE_ACCOUNT_JSON line to paste into the VPS .env (Hostinger browser terminal).
param(
  [string]$JsonFile = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$mobileDir = Join-Path $repoRoot "mobile"

if (-not $JsonFile) {
  $JsonFile = Get-ChildItem -Path $mobileDir -Filter "*firebase-adminsdk*.json" -File |
    Select-Object -First 1 -ExpandProperty FullName
}

if (-not $JsonFile -or -not (Test-Path $JsonFile)) {
  throw "Firebase service-account JSON not found in $mobileDir"
}

$serviceAccount = Get-Content -Raw -Path $JsonFile | ConvertFrom-Json
$inlineJson = ($serviceAccount | ConvertTo-Json -Compress -Depth 20)

Write-Host ""
Write-Host "Copy everything below into /opt/apps/hawknexa/deploy/.env on the VPS" -ForegroundColor Cyan
Write-Host "(Hostinger hPanel -> VPS -> Browser terminal -> nano /opt/apps/hawknexa/deploy/.env)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "FIREBASE_SERVICE_ACCOUNT_JSON=$inlineJson"
Write-Host ""
Write-Host "Then run on the VPS:" -ForegroundColor Cyan
Write-Host "  bash /opt/apps/hawknexa/deploy/deploy.sh" -ForegroundColor White
