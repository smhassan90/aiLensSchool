#!/usr/bin/env bash
# Copy production MySQL (Docker on VPS) into local Docker MySQL.
# Usage (from deploy/hawknexa):
#   bash sync-db-from-vps.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${SCRIPT_DIR}/.env.local"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.local.yml"
DATA_DIR="${SCRIPT_DIR}/data"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="${DATA_DIR}/vps-dump-${STAMP}.sql"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: ${ENV_FILE} not found. Copy .env.local.example to .env.local first." >&2
  exit 1
fi

read_env() {
  local key="$1"
  grep -m1 "^${key}=" "$ENV_FILE" | sed 's/\r$//' | cut -d= -f2- | tr -d '\r'
}

LOCAL_DB="$(read_env MYSQL_DATABASE)"
LOCAL_USER="$(read_env MYSQL_USER)"
LOCAL_PASS="$(read_env MYSQL_PASSWORD)"
ROOT_PASS="$(read_env MYSQL_ROOT_PASSWORD)"
VPS_HOST="$(read_env VPS_HOST)"
VPS_USER="$(read_env VPS_USER)"
VPS_DEPLOY_DIR="$(read_env VPS_DEPLOY_DIR)"

mkdir -p "$DATA_DIR"

echo "=== Dumping VPS database via SSH (${VPS_USER}@${VPS_HOST}) ==="
ssh "${VPS_USER}@${VPS_HOST}" "VPS_DEPLOY_DIR='${VPS_DEPLOY_DIR}' bash -s" > "${DUMP_FILE}" <<'REMOTE'
set -euo pipefail
DEPLOY_DIR="${VPS_DEPLOY_DIR:-/opt/apps/hawknexa/deploy}"
cd "$DEPLOY_DIR"
MYSQL_DATABASE="$(grep -m1 '^MYSQL_DATABASE=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_USER="$(grep -m1 '^MYSQL_USER=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_PASSWORD="$(grep -m1 '^MYSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')"
docker compose -f docker-compose.prod.yml exec -T mysql \
  mysqldump -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" \
  --single-transaction --routines --triggers --add-drop-database --no-tablespaces \
  "${MYSQL_DATABASE}"
REMOTE

if [[ ! -s "$DUMP_FILE" ]]; then
  echo "ERROR: dump file is empty — check SSH access and VPS MySQL credentials." >&2
  exit 1
fi

echo "Dump saved: ${DUMP_FILE} ($(du -h "$DUMP_FILE" 2>/dev/null | cut -f1 || echo '?'))"

echo "=== Ensuring local MySQL is running ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d mysql
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T mysql \
    mysqladmin ping -h localhost -u"${LOCAL_USER}" -p"${LOCAL_PASS}" --silent 2>/dev/null; then
    break
  fi
  sleep 2
done

echo "=== Stopping backend (if running) ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop backend portal 2>/dev/null || true

echo "=== Importing into local MySQL (${LOCAL_DB}) ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T mysql \
  mysql -uroot -p"${ROOT_PASS}" < "${DUMP_FILE}"

if grep -q '^SKIP_DB_PUSH=' "$ENV_FILE"; then
  perl -pi -e 's/^SKIP_DB_PUSH=.*/SKIP_DB_PUSH=true/' "$ENV_FILE" 2>/dev/null \
    || sed -i 's/^SKIP_DB_PUSH=.*/SKIP_DB_PUSH=true/' "$ENV_FILE" 2>/dev/null \
    || powershell -NoProfile -Command "(Get-Content '$ENV_FILE') -replace '^SKIP_DB_PUSH=.*','SKIP_DB_PUSH=true' | Set-Content '$ENV_FILE'"
else
  echo "SKIP_DB_PUSH=true" >> "$ENV_FILE"
fi
echo "Set SKIP_DB_PUSH=true in .env.local"

echo "=== Starting full stack ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build backend portal caddy redis

echo ""
echo "OK: local database is a replica of VPS."
echo "Portal:  http://localhost:$(read_env PORTAL_PORT)"
echo "API:     http://localhost:$(read_env BACKEND_PORT)/api/v1/health"
