#!/usr/bin/env bash
# Pull latest code and redeploy HawkNexa Docker stack on the VPS.
set -euo pipefail

REPO_DIR="/opt/apps/hawknexa/repo"
DEPLOY_DIR="/opt/apps/hawknexa/deploy"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-https://hawknexabackend.fynals.com/api/v1/health}"
PID_FILE="/tmp/hawknexa-deploy.pid"

if [[ ! -d "${REPO_DIR}/.git" ]]; then
  echo "ERROR: git repo not found at ${REPO_DIR}" >&2
  exit 1
fi

if [[ ! -f "${DEPLOY_DIR}/.env" ]]; then
  echo "ERROR: ${DEPLOY_DIR}/.env not found (create it once on the server)." >&2
  exit 1
fi

echo "$$" > "${PID_FILE}"
trap 'rm -f "${PID_FILE}"' EXIT

echo "=== Pull latest ${BRANCH} ==="
cd "${REPO_DIR}"
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "=== Sync deploy configs (keep server .env) ==="
mkdir -p "${DEPLOY_DIR}"
rsync -a --exclude '.env' "${REPO_DIR}/deploy/hawknexa/" "${DEPLOY_DIR}/"
sed -i 's/\r$//' "${DEPLOY_DIR}/deploy.sh" "${DEPLOY_DIR}/deploy-webhook.py" "${DEPLOY_DIR}/docker-compose.prod.yml" "${DEPLOY_DIR}/Caddyfile" "${DEPLOY_DIR}/Dockerfile.deploy-webhook" 2>/dev/null || true
chmod +x "${DEPLOY_DIR}/deploy.sh" "${DEPLOY_DIR}/deploy-webhook.py" "${DEPLOY_DIR}/import-remote-sms-db.sh" 2>/dev/null || true

echo "=== Build and start containers ==="
cd "${DEPLOY_DIR}"
docker compose -f "${COMPOSE_FILE}" build --pull backend portal
docker compose -f "${COMPOSE_FILE}" up -d mysql redis backend portal caddy

echo "=== Refresh deploy webhook (after app containers) ==="
docker compose -f "${COMPOSE_FILE}" build deploy-webhook
docker compose -f "${COMPOSE_FILE}" up -d --no-deps deploy-webhook

echo "=== Health check ==="
for i in 1 2 3 4 5 6; do
  if curl -fsS "${HEALTH_URL}" >/dev/null; then
    echo "OK: ${HEALTH_URL}"
    docker compose -f "${COMPOSE_FILE}" ps
    exit 0
  fi
  echo "Waiting for API... (${i}/6)"
  sleep 10
done

echo "ERROR: health check failed: ${HEALTH_URL}" >&2
docker compose -f "${COMPOSE_FILE}" ps
docker compose -f "${COMPOSE_FILE}" logs backend --tail 30
exit 1
