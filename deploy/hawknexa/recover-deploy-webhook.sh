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

echo "=== Build and start deploy-webhook + reload Caddy ==="
docker compose -f "${COMPOSE_FILE}" build deploy-webhook
docker compose -f "${COMPOSE_FILE}" up -d --no-deps deploy-webhook
docker compose -f "${COMPOSE_FILE}" up -d --no-deps caddy

sleep 3

echo "=== Container status ==="
docker compose -f "${COMPOSE_FILE}" ps deploy-webhook caddy

echo "=== deploy-webhook logs (last 30 lines) ==="
docker compose -f "${COMPOSE_FILE}" logs deploy-webhook --tail 30

echo "=== Internal health (from Caddy container) ==="
if docker compose -f "${COMPOSE_FILE}" exec -T caddy wget -qO- http://deploy-webhook:9000/health 2>/dev/null; then
  echo "(deploy-webhook reachable inside Docker network)"
else
  echo "WARN: could not reach deploy-webhook:9000 from caddy container" >&2
fi

echo "=== Public health check ==="
if curl -fsS https://hawknexabackend.fynals.com/internal/deploy/health; then
  echo ""
  echo "OK: webhook is healthy. Re-run GitHub Actions or: bash ${DEPLOY_DIR}/deploy.sh"
else
  echo "ERROR: https://hawknexabackend.fynals.com/internal/deploy/health did not return ok" >&2
  echo "If you still see 404, Caddy may need the updated Caddyfile (handle /internal/deploy*)." >&2
  exit 1
fi
