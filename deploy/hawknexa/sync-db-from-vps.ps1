# Copy VPS MySQL (Docker) into local Docker MySQL.
# Usage: .\sync-db-from-vps.ps1
# Requires: Docker, SSH access to VPS (password or key).

$ErrorActionPreference = "Stop"
$DeployDir = $PSScriptRoot
$bash = $null
foreach ($candidate in @(
  "$env:ProgramFiles\Git\bin\bash.exe",
  "$env:ProgramFiles\Git\usr\bin\bash.exe",
  "bash"
)) {
  if (Get-Command $candidate -ErrorAction SilentlyContinue) { $bash = $candidate; break }
}
if (-not $bash) {
  throw "Git Bash required. Install Git for Windows, then run: bash sync-db-from-vps.sh"
}
& $bash (Join-Path $DeployDir "sync-db-from-vps.sh")
exit $LASTEXITCODE
