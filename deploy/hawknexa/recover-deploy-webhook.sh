#!/usr/bin/env bash
# One-shot recovery when GitHub Actions gets HTTP 502 on /internal/deploy.
# Run on the VPS (Hostinger browser terminal or SSH):
#   bash /opt/apps/hawknexa/deploy/recover-deploy-webhook.sh
set -euo pipefail

REPO_DIR="/opt/apps/hawknexa/repo"
DEPLOY_DIR="/opt/apps/hawknexa/deploy"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"

echo "=== HawkNexa deploy webhook recovery ==="

if [[ ! -f "${DEPLOY_DIR}/.env" ]]; then
  echo "ERROR: ${DEPLOY_DIR}/.env not found." >&2
  exit 1
fi

if ! grep -qE '^DEPLOY_WEBHOOK_SECRET=.+$' "${DEPLOY_DIR}/.env"; then
  echo "ERROR: ${DEPLOY_DIR}/.env must set DEPLOY_WEBHOOK_SECRET (same value as GitHub secret HAWKNEXA_DEPLOY_WEBHOOK_SECRET)." >&2
  exit 1
fi

if [[ -d "${REPO_DIR}/.git" ]]; then
  echo "=== Pull latest deploy configs from repo ==="
  cd "${REPO_DIR}"
  git fetch origin main
  git reset --hard origin/main
  rsync -a --exclude '.env' "${REPO_DIR}/deploy/hawknexa/" "${DEPLOY_DIR}/"
  sed -i 's/\r$//' "${DEPLOY_DIR}/"*.sh "${DEPLOY_DIR}/"*.py "${DEPLOY_DIR}/"*.yml "${DEPLOY_DIR}/Caddyfile" 2>/dev/null || true
  chmod +x "${DEPLOY_DIR}/deploy.sh" "${DEPLOY_DIR}/recover-deploy-webhook.sh" "${DEPLOY_DIR}/deploy-webhook.py" 2>/dev/null || true
else
  echo "WARN: ${REPO_DIR} not a git repo — using existing files in ${DEPLOY_DIR}"
fi

cd "${DEPLOY_DIR}"

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

echo "=== Build and start deploy-webhook + reload Caddy ==="
docker compose -f "${COMPOSE_FILE}" build deploy-webhook
docker compose -f "${COMPOSE_FILE}" up -d --no-deps deploy-webhook
docker compose -f "${COMPOSE_FILE}" up -d --no-deps caddy

sleep 3

echo "=== Container status ==="
docker compose -f "${COMPOSE_FILE}" ps deploy-webhook caddy

echo "=== Listening ports ==="
ss -tlnp | grep -E ':80|:443' || netstat -tlnp 2>/dev/null | grep -E ':80|:443' || true

echo "=== deploy-webhook logs (last 30 lines) ==="
docker compose -f "${COMPOSE_FILE}" logs deploy-webhook --tail 30

echo "=== Internal health (from Caddy container) ==="
if docker compose -f "${COMPOSE_FILE}" exec -T caddy wget -qO- http://deploy-webhook:9000/health 2>/dev/null; then
  echo "(deploy-webhook reachable inside Docker network)"
else
  echo "WARN: could not reach deploy-webhook:9000 from caddy container" >&2
fi

echo "=== Local health (via Caddy on this server) ==="
local_ok=0
if curl -fsS --max-time 5 http://127.0.0.1/internal/deploy/health -H 'Host: hawknexabackend.fynals.com' >/dev/null 2>&1; then
  echo "OK: webhook reachable locally on :80"
  local_ok=1
else
  echo "WARN: local :80 check failed — Caddy may not be listening" >&2
  docker compose -f "${COMPOSE_FILE}" logs caddy --tail 30
fi

echo "=== Public health check ==="
if curl -fsS --max-time 15 https://hawknexabackend.fynals.com/internal/deploy/health; then
  echo ""
  echo "OK: webhook is healthy. Re-run GitHub Actions or: bash ${DEPLOY_DIR}/deploy.sh"
elif [ "${local_ok}" = "1" ]; then
  echo "ERROR: webhook works locally but HTTPS from the internet times out (HTTP 000)." >&2
  echo "Open Hostinger VPS panel → Firewall and allow inbound TCP 80 and 443." >&2
  exit 1
else
  echo "ERROR: https://hawknexabackend.fynals.com/internal/deploy/health did not return ok" >&2
  echo "Run: bash ${DEPLOY_DIR}/recover-vps.sh" >&2
  exit 1
fi
