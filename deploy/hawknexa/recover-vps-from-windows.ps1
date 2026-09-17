# Run HawkNexa deploy-webhook recovery ON THE VPS via SSH from Windows.
# Usage (PowerShell):
#   .\deploy\hawknexa\recover-vps-from-windows.ps1
# Optional:
#   $env:HAWKNEXA_VPS_HOST = "187.53.141.109"
#   $env:HAWKNEXA_VPS_USER = "root"

$ErrorActionPreference = "Stop"
$hostName = if ($env:HAWKNEXA_VPS_HOST) { $env:HAWKNEXA_VPS_HOST } else { "187.53.141.109" }
$user = if ($env:HAWKNEXA_VPS_USER) { $env:HAWKNEXA_VPS_USER } else { "root" }
$remote = "${user}@${hostName}"

$script = @'
bash /opt/apps/hawknexa/deploy/recover-vps.sh 2>/dev/null || {
  set -euo pipefail
  systemctl start docker || service docker start
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  REPO_DIR="/opt/apps/hawknexa/repo"
  DEPLOY_DIR="/opt/apps/hawknexa/deploy"
  COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
  if [ -d "${REPO_DIR}/.git" ]; then
    cd "${REPO_DIR}"
    git fetch origin main
    git reset --hard origin/main
    rsync -a --exclude '.env' "${REPO_DIR}/deploy/hawknexa/" "${DEPLOY_DIR}/"
    chmod +x "${DEPLOY_DIR}/"*.sh
  fi
  cd "${DEPLOY_DIR}"
  docker compose -f "${COMPOSE_FILE}" up -d --build --no-deps deploy-webhook caddy
  sleep 4
  curl -fsS https://hawknexabackend.fynals.com/internal/deploy/health
  echo ""
  echo "Webhook recovered."
}
'@

Write-Host "Connecting to $remote ..."
Write-Host "(You may be prompted for your VPS SSH password if no key is configured.)"
ssh $remote $script
