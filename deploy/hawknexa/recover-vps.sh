#!/usr/bin/env bash
# Full VPS recovery when GitHub Actions shows HTTP 000/502 on deploy webhook.
# Run on the VPS (Hostinger browser terminal):
#   bash /opt/apps/hawknexa/deploy/recover-vps.sh
set -euo pipefail

REPO_DIR="/opt/apps/hawknexa/repo"
DEPLOY_DIR="/opt/apps/hawknexa/deploy"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"

echo "=== HawkNexa VPS recovery ==="

if [[ ! -f "${DEPLOY_DIR}/.env" ]]; then
  echo "ERROR: ${DEPLOY_DIR}/.env not found." >&2
  exit 1
fi

echo "=== Ensure Docker is running ==="
if ! systemctl is-active --quiet docker 2>/dev/null; then
  systemctl start docker || service docker start
fi
docker info >/dev/null

echo "=== Firewall (UFW) — allow HTTP/HTTPS ==="
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 80/tcp comment 'HTTP' >/dev/null 2>&1 || true
  ufw allow 443/tcp comment 'HTTPS' >/dev/null 2>&1 || true
  ufw status verbose 2>/dev/null || true
fi

if [[ -d "${REPO_DIR}/.git" ]]; then
  echo "=== Pull latest deploy configs ==="
  cd "${REPO_DIR}"
  git fetch origin main
  git reset --hard origin/main
  rsync -a --exclude '.env' "${REPO_DIR}/deploy/hawknexa/" "${DEPLOY_DIR}/"
  sed -i 's/\r$//' "${DEPLOY_DIR}/"*.sh "${DEPLOY_DIR}/"*.py "${DEPLOY_DIR}/"*.yml "${DEPLOY_DIR}/Caddyfile" 2>/dev/null || true
  chmod +x "${DEPLOY_DIR}/"*.sh 2>/dev/null || true
fi

cd "${DEPLOY_DIR}"

echo "=== Start deploy-webhook + Caddy (no app deps) ==="
docker compose -f "${COMPOSE_FILE}" build deploy-webhook
docker compose -f "${COMPOSE_FILE}" up -d --no-deps deploy-webhook caddy

sleep 4

echo "=== Listening ports ==="
ss -tlnp | grep -E ':80|:443' || netstat -tlnp 2>/dev/null | grep -E ':80|:443' || true

echo "=== Container status ==="
docker compose -f "${COMPOSE_FILE}" ps

echo "=== Webhook logs ==="
docker compose -f "${COMPOSE_FILE}" logs deploy-webhook --tail 20

echo "=== Caddy logs ==="
docker compose -f "${COMPOSE_FILE}" logs caddy --tail 20

echo "=== Internal webhook health ==="
if docker compose -f "${COMPOSE_FILE}" exec -T deploy-webhook python3 -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:9000/health', timeout=3).read().decode())"; then
  echo "OK: webhook responds inside container"
else
  echo "ERROR: webhook not responding on :9000" >&2
  exit 1
fi

echo "=== Public webhook health ==="
if curl -fsS --max-time 15 https://hawknexabackend.fynals.com/internal/deploy/health; then
  echo ""
  echo "OK: public webhook healthy. Run: bash ${DEPLOY_DIR}/deploy.sh"
else
  echo "WARN: public HTTPS still failing. Check Hostinger firewall panel (allow 80/443) and DNS for hawknexabackend.fynals.com" >&2
  echo "Local test: curl -vk https://127.0.0.1/internal/deploy/health -H 'Host: hawknexabackend.fynals.com'" >&2
  exit 1
fi
