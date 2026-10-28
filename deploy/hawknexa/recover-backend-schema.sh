#!/usr/bin/env bash
# Diagnose backend restart loop and apply Prisma schema manually (Hostinger / VPS terminal).
set -euo pipefail
COMPOSE_FILE="${COMPOSE_FILE:-/opt/apps/hawknexa/deploy/docker-compose.prod.yml}"
cd "$(dirname "$COMPOSE_FILE")"

MYSQL_USER="$(grep -m1 '^MYSQL_USER=' .env | cut -d= -f2- | tr -d '\r' || echo sms)"
MYSQL_PASSWORD="$(grep -m1 '^MYSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')"
if [[ -z "${MYSQL_PASSWORD}" ]]; then
  echo "ERROR: MYSQL_PASSWORD not found in $(pwd)/.env" >&2
  exit 1
fi

echo "=== Container status ==="
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "=== Backend logs (last 120 lines) ==="
docker compose -f "$COMPOSE_FILE" logs backend --tail 120 || true

echo ""
echo "=== MySQL ping ==="
docker compose -f "$COMPOSE_FILE" exec -T mysql mysqladmin ping -h localhost -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" 2>/dev/null || echo "MySQL not reachable"

echo ""
echo "=== Manual prisma db push (one-off, no app start) ==="
echo "This applies planner/timetable schema changes. Safe to re-run if idempotent."
docker compose -f "$COMPOSE_FILE" run --rm --no-deps \
  -e SKIP_DB_PUSH=true \
  --entrypoint sh \
  backend -c "npx prisma db push --skip-generate" || {
  echo "ERROR: prisma db push failed. Read output above (often enum/FK/disk space)."
  exit 1
}

echo ""
echo "=== Restart backend + portal ==="
docker compose -f "$COMPOSE_FILE" up -d backend portal

echo ""
echo "=== Health check ==="
for i in $(seq 1 24); do
  if curl -fsS https://hawknexabackend.fynals.com/api/v1/health >/dev/null 2>&1; then
    echo "OK"
    curl -fsS https://hawknexabackend.fynals.com/api/v1/health
    exit 0
  fi
  echo "waiting ${i}/24..."
  sleep 5
done

echo "Still failing — run: docker compose -f $COMPOSE_FILE logs backend --tail 80"
exit 1
