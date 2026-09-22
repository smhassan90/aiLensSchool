#!/usr/bin/env bash
# Pull latest code and redeploy HawkNexa Docker stack on the VPS.
set -euo pipefail

REPO_DIR="/opt/apps/hawknexa/repo"
DEPLOY_DIR="/opt/apps/hawknexa/deploy"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-https://hawknexabackend.fynals.com/api/v1/health}"
HEALTH_ATTEMPTS="${DEPLOY_HEALTH_ATTEMPTS:-24}"
STATUS_FILE="${DEPLOY_DIR}/.last-deploy.json"
PID_FILE="/tmp/hawknexa-deploy.pid"
LOCK_DIR="/tmp/hawknexa-deploy.lockdir"
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

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  echo "ERROR: Another deploy is already running (${LOCK_DIR})" >&2
  exit 1
fi

echo "$$" > "${PID_FILE}"
cleanup() {
  rm -f "${PID_FILE}"
  rmdir "${LOCK_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

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
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

BUILD_BACKEND=true
BUILD_PORTAL=true
RESTART_CADDY=false
CHANGED=""
LAST_SUCCESS_COMMIT=""
if [[ -f "${STATUS_FILE}" ]]; then
  LAST_SUCCESS_COMMIT="$(python3 -c "import json; d=json.load(open('${STATUS_FILE}')); print(d.get('commit') or '')" 2>/dev/null || true)"
fi

if [[ "${FORCE_FULL_BUILD:-false}" != "true" && -n "${LAST_SUCCESS_COMMIT}" ]]; then
  if git -C "${REPO_DIR}" cat-file -e "${LAST_SUCCESS_COMMIT}^{commit}" 2>/dev/null; then
    CHANGED="$(git -C "${REPO_DIR}" diff --name-only "${LAST_SUCCESS_COMMIT}" HEAD)"
    BUILD_BACKEND=false
    BUILD_PORTAL=false
    if echo "${CHANGED}" | grep -qE '^backend/'; then BUILD_BACKEND=true; fi
    if echo "${CHANGED}" | grep -qE '^portal/'; then BUILD_PORTAL=true; fi
    if [[ "${BUILD_BACKEND}" == "false" && "${BUILD_PORTAL}" == "false" ]]; then
      echo "No backend/portal changes since ${LAST_SUCCESS_COMMIT}; skipping image rebuild"
    fi
    if echo "${CHANGED}" | grep -qE '^deploy/hawknexa/'; then RESTART_CADDY=true; fi
  fi
fi

if [[ -n "${DEPLOY_TARGETS:-}" ]]; then
  BUILD_BACKEND=false
  BUILD_PORTAL=false
  if echo ",${DEPLOY_TARGETS}," | grep -q ',backend,'; then BUILD_BACKEND=true; fi
  if echo ",${DEPLOY_TARGETS}," | grep -q ',portal,'; then BUILD_PORTAL=true; fi
  echo "DEPLOY_TARGETS=${DEPLOY_TARGETS}"
fi

BUILD_SERVICES=()
if [[ "${BUILD_BACKEND}" == "true" ]]; then BUILD_SERVICES+=(backend); fi
if [[ "${BUILD_PORTAL}" == "true" ]]; then BUILD_SERVICES+=(portal); fi
if ((${#BUILD_SERVICES[@]} > 0)); then
  echo "Building: ${BUILD_SERVICES[*]}"
  docker compose -f "${COMPOSE_FILE}" build --parallel "${BUILD_SERVICES[@]}"
else
  echo "Skipping docker build"
fi

compose_up() {
  local attempt="$1"
  echo "=== Start app containers (attempt ${attempt}) ==="
  docker compose -f "${COMPOSE_FILE}" up -d mysql redis
  if [[ "${BUILD_BACKEND}" == "true" && "${BUILD_PORTAL}" == "true" ]]; then
    if [[ "${SKIP_WEBHOOK_RESTART}" == "true" ]]; then
      docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans backend portal caddy
    else
      docker compose -f "${COMPOSE_FILE}" build deploy-webhook
      docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans backend portal caddy deploy-webhook
    fi
  elif [[ "${BUILD_BACKEND}" == "true" ]]; then
    docker compose -f "${COMPOSE_FILE}" up -d --no-deps backend
  elif [[ "${BUILD_PORTAL}" == "true" ]]; then
    docker compose -f "${COMPOSE_FILE}" up -d --no-deps portal caddy
  elif [[ "${RESTART_CADDY}" == "true" ]]; then
    docker compose -f "${COMPOSE_FILE}" up -d --no-deps caddy
    if [[ "${SKIP_WEBHOOK_RESTART}" != "true" ]]; then
      docker compose -f "${COMPOSE_FILE}" build deploy-webhook
      docker compose -f "${COMPOSE_FILE}" up -d --no-deps deploy-webhook
    fi
  elif [[ "${SKIP_WEBHOOK_RESTART}" != "true" ]]; then
    docker compose -f "${COMPOSE_FILE}" build deploy-webhook
    docker compose -f "${COMPOSE_FILE}" up -d --no-deps deploy-webhook caddy
  fi
}

if ! compose_up 1; then
  echo "WARN: compose up failed, pruning stale containers and retrying once..." >&2
  docker compose -f "${COMPOSE_FILE}" rm -sf backend portal 2>/dev/null || true
  sleep 3
  compose_up 2
fi

echo "=== Health check ==="
for i in $(seq 1 "${HEALTH_ATTEMPTS}"); do
  if curl -fsS "${HEALTH_URL}" >/dev/null; then
    echo "OK: ${HEALTH_URL}"
    docker compose -f "${COMPOSE_FILE}" ps
    trap - ERR
    write_status "success" "Deploy completed" "${BUILD_SHA}"
    exit 0
  fi
  echo "Waiting for API... (${i}/6)"
  sleep 5
done

echo "ERROR: health check failed: ${HEALTH_URL}" >&2
docker compose -f "${COMPOSE_FILE}" ps
docker compose -f "${COMPOSE_FILE}" logs backend --tail 30
exit 1
