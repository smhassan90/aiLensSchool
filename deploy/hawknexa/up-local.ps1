# Start local HawkNexa Docker stack (mirrors VPS: MySQL, Redis, backend, portal, Caddy).
# Usage (PowerShell from repo root or this folder):
#   .\deploy\hawknexa\up-local.ps1
#   .\deploy\hawknexa\up-local.ps1 -SyncDb   # also copy VPS database first (needs SSH)

param(
  [switch]$SyncDb,
  [switch]$Build
)

$ErrorActionPreference = "Stop"
$DeployDir = $PSScriptRoot
$EnvFile = Join-Path $DeployDir ".env.local"
$ExampleFile = Join-Path $DeployDir ".env.local.example"
$ComposeFile = Join-Path $DeployDir "docker-compose.local.yml"

if (-not (Test-Path $EnvFile)) {
  Copy-Item $ExampleFile $EnvFile
  Write-Host "Created .env.local from .env.local.example"
}

if ($SyncDb) {
  $bash = $null
  foreach ($candidate in @(
    "$env:ProgramFiles\Git\bin\bash.exe",
    "$env:ProgramFiles\Git\usr\bin\bash.exe",
    "bash"
  )) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) { $bash = $candidate; break }
  }
  if (-not $bash) {
    throw "Git Bash required for -SyncDb. Install Git for Windows or run: bash sync-db-from-vps.sh"
  }
  & $bash (Join-Path $DeployDir "sync-db-from-vps.sh")
  exit $LASTEXITCODE
}

$args = @("compose", "-f", $ComposeFile, "--env-file", $EnvFile, "up", "-d")
if ($Build) { $args += "--build" }

Write-Host "Starting local HawkNexa stack..."
Push-Location $DeployDir
docker @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

function Read-EnvValue([string]$Key) {
  $line = Select-String -Path $EnvFile -Pattern "^$Key=" | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line.Line -replace "^$Key=", "").Trim()
}

$portalPort = Read-EnvValue "PORTAL_PORT"
if (-not $portalPort) { $portalPort = "3000" }
$backendPort = Read-EnvValue "BACKEND_PORT"
if (-not $backendPort) { $backendPort = "3001" }
$caddyPort = Read-EnvValue "CADDY_HTTP_PORT"
if (-not $caddyPort) { $caddyPort = "8080" }

Write-Host ""
Write-Host "Local stack is up."
Write-Host "  Portal (direct):  http://localhost:$portalPort"
Write-Host "  API (direct):     http://localhost:$backendPort/api/v1/health"
Write-Host "  Portal (Caddy):   http://hawknexa.localhost:$caddyPort"
Write-Host "  API (Caddy):      http://hawknexabackend.localhost:$caddyPort/api/v1/health"
Write-Host ""
Write-Host "Copy VPS database: .\up-local.ps1 -SyncDb"
Pop-Location
