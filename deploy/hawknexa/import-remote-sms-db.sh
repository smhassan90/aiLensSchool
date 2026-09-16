#!/usr/bin/env bash
# Copy remote `sms` database to local HawkNexa MySQL:
# 1) create same structure per table, 2) copy data table-by-table.
set -euo pipefail

DEPLOY_DIR="/opt/apps/hawknexa/deploy"
DATA_DIR="/opt/apps/hawknexa/data"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

REMOTE_HOST="66.135.60.203"
REMOTE_PORT="3308"
REMOTE_DB="sms"
REMOTE_USER="sms"
REMOTE_PASS="smspassword"

read_env() {
  local key="$1"
  grep -m1 "^${key}=" "${DEPLOY_DIR}/.env" | sed 's/\r$//' | cut -d= -f2- | tr -d '\r'
}

LOCAL_DB="$(read_env MYSQL_DATABASE)"
LOCAL_USER="$(read_env MYSQL_USER)"
LOCAL_PASS="$(read_env MYSQL_PASSWORD)"
ROOT_PASS="$(read_env MYSQL_ROOT_PASSWORD)"

LOCAL_DB="${LOCAL_DB:-hawknexa}"
LOCAL_USER="${LOCAL_USER:-hawknexa}"

mkdir -p "$DATA_DIR"
BACKUP_FILE="${DATA_DIR}/hawknexa-backup-${STAMP}.sql"
LOG_FILE="${DATA_DIR}/import-remote-sms-${STAMP}.log"

exec > >(tee -a "$LOG_FILE") 2>&1

echo "Log: $LOG_FILE"
cd "$DEPLOY_DIR"

remote_mysql() {
  docker run --rm -i mysql:8.0 mysql \
    -h "$REMOTE_HOST" -P "$REMOTE_PORT" \
    -u"$REMOTE_USER" -p"$REMOTE_PASS" \
    --batch --skip-column-names "$@"
}

local_mysql() {
  docker compose -f "$COMPOSE_FILE" exec -T mysql \
    mysql -u"$LOCAL_USER" -p"$LOCAL_PASS" "$@"
}

local_root_mysql() {
  docker compose -f "$COMPOSE_FILE" exec -T mysql \
    mysql -uroot -p"$ROOT_PASS" "$@"
}

echo "=== Step 1: Backup current local database (${LOCAL_DB}) ==="
docker compose -f "$COMPOSE_FILE" exec -T mysql \
  mysqldump -u"${LOCAL_USER}" -p"${LOCAL_PASS}" \
  --single-transaction --no-tablespaces --routines --triggers "${LOCAL_DB}" \
  > "${BACKUP_FILE}" 2>/dev/null || echo "Backup skipped or partial: ${BACKUP_FILE}"

echo "=== Step 2: Fetch remote table list ==="
mapfile -t TABLES < <(remote_mysql -e "SELECT table_name FROM information_schema.tables WHERE table_schema='${REMOTE_DB}' AND table_type='BASE TABLE' ORDER BY table_name;")
echo "Remote tables: ${#TABLES[@]}"

echo "=== Step 3: Stop backend ==="
docker compose -f "$COMPOSE_FILE" stop backend

echo "=== Step 4: Recreate local database ==="
local_root_mysql -e "
  DROP DATABASE IF EXISTS \`${LOCAL_DB}\`;
  CREATE DATABASE \`${LOCAL_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  GRANT ALL PRIVILEGES ON \`${LOCAL_DB}\`.* TO '${LOCAL_USER}'@'%';
  FLUSH PRIVILEGES;
"

echo "=== Step 5: Create structure + copy data table by table ==="
for table in "${TABLES[@]}"; do
  echo "  -> ${table} (structure)"
  create_sql="$(remote_mysql -e "SHOW CREATE TABLE \`${REMOTE_DB}\`.\`${table}\`;" | sed 's/^[^\t]*\t//')"
  local_mysql "$LOCAL_DB" -e "SET FOREIGN_KEY_CHECKS=0; ${create_sql}; SET FOREIGN_KEY_CHECKS=1;"

  echo "  -> ${table} (data)"
  docker run --rm mysql:8.0 \
    mysqldump -h "$REMOTE_HOST" -P "$REMOTE_PORT" \
    -u"$REMOTE_USER" -p"$REMOTE_PASS" \
    --no-create-info --single-transaction --quick --skip-triggers --no-tablespaces \
    "$REMOTE_DB" "$table" 2>/dev/null \
    | docker compose -f "$COMPOSE_FILE" exec -T mysql \
      mysql -u"${LOCAL_USER}" -p"${LOCAL_PASS}" "${LOCAL_DB}"
done

echo "=== Step 6: Import routines/triggers (schema objects) ==="
ROUTINES_FILE="${DATA_DIR}/remote-sms-routines-${STAMP}.sql"
docker run --rm mysql:8.0 \
  mysqldump -h "$REMOTE_HOST" -P "$REMOTE_PORT" \
  -u"$REMOTE_USER" -p"$REMOTE_PASS" \
  --no-data --no-create-info --routines --triggers --no-tablespaces \
  "$REMOTE_DB" > "$ROUTINES_FILE" 2>/dev/null || true
if [[ -s "$ROUTINES_FILE" ]]; then
  sed "s/\`${REMOTE_DB}\`/\`${LOCAL_DB}\`/g" "$ROUTINES_FILE" \
    | docker compose -f "$COMPOSE_FILE" exec -T mysql \
      mysql -u"${LOCAL_USER}" -p"${LOCAL_PASS}" "${LOCAL_DB}" || true
fi

echo "=== Step 7: Verify row counts ==="
mismatches=0
for table in "${TABLES[@]}"; do
  remote_count="$(remote_mysql -e "SELECT COUNT(*) FROM \`${REMOTE_DB}\`.\`${table}\`;")"
  local_count="$(local_mysql "$LOCAL_DB" -N -e "SELECT COUNT(*) FROM \`${table}\`;")"
  if [[ "$remote_count" != "$local_count" ]]; then
    echo "  MISMATCH ${table}: remote=${remote_count} local=${local_count}"
    mismatches=$((mismatches + 1))
  fi
done
echo "Row-count mismatches: ${mismatches}"

echo "=== Step 8: Start backend ==="
docker compose -f "$COMPOSE_FILE" up -d backend
sleep 10
curl -fsS "https://srv1984496.hstgr.cloud/api/v1/health" && echo ""
echo "Import complete."
