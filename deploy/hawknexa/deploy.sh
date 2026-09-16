#!/usr/bin/env bash
# Pull latest code and redeploy HawkNexa Docker stack on the VPS.
set -euo pipefail

REPO_DIR="/opt/apps/hawknexa/repo"
DEPLOY_DIR="/opt/apps/hawknexa/deploy"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-https://hawknexabackend.fynals.com/api/v1/health}"
STATUS_FILE="${DEPLOY_DIR}/.last-deploy.json"
PID_FILE="/tmp/hawknexa-deploy.pid"
SKIP_WEBHOOK_RESTART="${SKIP_WEBHOOK_RESTART:-false}"

write_status() {
  local status="$1"
  local message="${2:-}"
  local commit="${3:-}"
  python3 - <<PY
import json
from datetime import datetime, timezone

payload = {
    "status": "${status}",
    "message": "${message}",
    "commit": "${commit}" or None,
    "updatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
}
with open("${STATUS_FILE}", "w", encoding="utf-8") as handle:
    json.dump(payload, handle)
    handle.write("\n")
PY
}

on_error() {
  local code=$?
  write_status "failed" "Deploy exited with status ${code}"
  exit "${code}"
}
trap on_error ERR

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

write_status "running" "Deploy started"

cd "${DEPLOY_DIR}"

if [[ "${SKIP_WEBHOOK_RESTART}" != "true" ]]; then
  echo "=== Ensure deploy webhook is running ==="
  docker compose -f "${COMPOSE_FILE}" build deploy-webhook
  docker compose -f "${COMPOSE_FILE}" up -d --no-deps deploy-webhook
  sleep 2
  if ! docker compose -f "${COMPOSE_FILE}" ps deploy-webhook | grep -q "Up"; then
    echo "ERROR: deploy-webhook failed to start. Check logs:" >&2
    docker compose -f "${COMPOSE_FILE}" logs deploy-webhook --tail 30
    exit 1
  fi
fi

echo "=== Pull latest ${BRANCH} ==="
cd "${REPO_DIR}"
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "=== Sync deploy configs (keep server .env) ==="
mkdir -p "${DEPLOY_DIR}"
rsync -a --exclude '.env' "${REPO_DIR}/deploy/hawknexa/" "${DEPLOY_DIR}/"
sed -i 's/\r$//' "${DEPLOY_DIR}/deploy.sh" "${DEPLOY_DIR}/deploy-webhook.py" "${DEPLOY_DIR}/docker-compose.prod.yml" "${DEPLOY_DIR}/Caddyfile" "${DEPLOY_DIR}/Dockerfile.deploy-webhook" 2>/dev/null || true
chmod +x "${DEPLOY_DIR}/deploy.sh" "${DEPLOY_DIR}/recover-deploy-webhook.sh" "${DEPLOY_DIR}/deploy-webhook.py" "${DEPLOY_DIR}/import-remote-sms-db.sh" 2>/dev/null || true

echo "=== Build and start containers ==="
cd "${DEPLOY_DIR}"
export BUILD_SHA="$(cd "${REPO_DIR}" && git rev-parse --short HEAD)"
echo "BUILD_SHA=${BUILD_SHA}"
docker compose -f "${COMPOSE_FILE}" build --pull backend portal
docker compose -f "${COMPOSE_FILE}" up -d mysql redis backend portal caddy deploy-webhook

if [[ "${SKIP_WEBHOOK_RESTART}" != "true" ]]; then
  echo "=== Refresh deploy webhook ==="
  docker compose -f "${COMPOSE_FILE}" build deploy-webhook
  docker compose -f "${COMPOSE_FILE}" up -d --no-deps deploy-webhook
fi

echo "=== Health check ==="
for i in 1 2 3 4 5 6; do
  if curl -fsS "${HEALTH_URL}" >/dev/null; then
    echo "OK: ${HEALTH_URL}"
    docker compose -f "${COMPOSE_FILE}" ps
    trap - ERR
    write_status "success" "Deploy completed" "${BUILD_SHA}"
    exit 0
  fi
  echo "Waiting for API... (${i}/6)"
  sleep 10
done

echo "ERROR: health check failed: ${HEALTH_URL}" >&2
docker compose -f "${COMPOSE_FILE}" ps
docker compose -f "${COMPOSE_FILE}" logs backend --tail 30
exit 1
