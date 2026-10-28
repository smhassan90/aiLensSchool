#!/usr/bin/env bash
# Pull repo, apply teaching-pack tables, list TPS chapters, generate AI packs on VPS MySQL.
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@187.53.141.109}"
LIMIT="${LIMIT:-}"
EXTRA_ARGS="${EXTRA_ARGS:-}"

ssh -o BatchMode=yes -o ConnectTimeout=30 "$VPS_HOST" bash -s <<REMOTE
set -euo pipefail
REPO="/opt/apps/hawknexa/repo"
DEPLOY="/opt/apps/hawknexa/deploy"
cd "\$REPO"
git pull origin main

cd "\$DEPLOY"
MYSQL_DATABASE="\$(grep -m1 '^MYSQL_DATABASE=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_USER="\$(grep -m1 '^MYSQL_USER=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_PASSWORD="\$(grep -m1 '^MYSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')"

run_sql() {
  docker compose -f docker-compose.prod.yml exec -T mysql \\
    mysql -u"\${MYSQL_USER}" -p"\${MYSQL_PASSWORD}" "\${MYSQL_DATABASE}" "\$@"
}

echo "=== Applying teaching pack migration (idempotent) ==="
MIG="\$REPO/backend/prisma/migrations/20261029120000_library_chapter_teaching_pack/migration.sql"
if [[ ! -f "\$MIG" ]]; then
  echo "Missing migration file: \$MIG" >&2
  exit 1
fi

table_exists() {
  run_sql -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='\${MYSQL_DATABASE}' AND TABLE_NAME='\$1';"
}

if [[ "\$(table_exists library_chapter_teaching_packs)" != "1" ]]; then
  run_sql < "\$MIG"
  echo "Migration applied."
else
  echo "library_chapter_teaching_packs already exists."
fi

echo "=== Running generator in backend container (mounted repo) ==="
LIMIT_ARG="${LIMIT}"
EXTRA="${EXTRA_ARGS}"
GEN_CMD="npx prisma generate && npx ts-node --transpile-only scripts/generate-tps-chapter-teaching-packs.ts"
if [[ -n "\$LIMIT_ARG" ]]; then
  GEN_CMD="\$GEN_CMD --limit=\$LIMIT_ARG"
fi
if [[ -n "\$EXTRA" ]]; then
  GEN_CMD="\$GEN_CMD \$EXTRA"
fi

docker compose -f docker-compose.prod.yml run --rm --no-deps \\
  --entrypoint "" \\
  -v "\$REPO/backend:/app" \\
  -w /app \\
  backend sh -c "\$GEN_CMD"

echo "=== Done ==="
REMOTE
