#!/usr/bin/env bash
set -euo pipefail
REPO="/opt/apps/hawknexa/repo"
DEPLOY="/opt/apps/hawknexa/deploy"
cd "$REPO"
git pull origin main

cd "$DEPLOY"
set -a
source ./.env
set +a

compose() {
  docker compose -f docker-compose.prod.yml "$@"
}

mysql_exec() {
  compose exec -T mysql mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" "$@"
}

MIG="$REPO/backend/prisma/migrations/20261029120000_library_chapter_teaching_pack/migration.sql"
COUNT="$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='library_chapter_teaching_packs';")"
if [[ "$COUNT" != "1" ]]; then
  echo "Applying migration..."
  mysql_exec < "$MIG"
else
  echo "Teaching pack tables already present."
fi

MODE="${1:-list}"
LIMIT="${2:-}"
CHAPTER_IDS="${3:-}"

GEN_ARGS="--transpile-only scripts/generate-tps-chapter-teaching-packs.ts"
case "$MODE" in
  list) GEN_ARGS="$GEN_ARGS --list" ;;
  generate)
    if [[ -n "$LIMIT" ]]; then
      GEN_ARGS="$GEN_ARGS --limit=$LIMIT"
    fi
    ;;
  force)
    GEN_ARGS="$GEN_ARGS --force"
    if [[ -n "$LIMIT" ]]; then
      GEN_ARGS="$GEN_ARGS --limit=$LIMIT"
    fi
    ;;
  retry-provisional)
    GEN_ARGS="$GEN_ARGS --force --chapter-ids=${CHAPTER_IDS}"
    export CHAPTER_TEACHING_PACK_CURSOR_TIMEOUT_MS="${CHAPTER_TEACHING_PACK_CURSOR_TIMEOUT_MS:-240000}"
    ;;
  *) echo "Usage: $0 [list|generate|force] [limit] [chapter-ids-for-retry-provisional]" >&2; exit 1 ;;
esac

if [[ "$MODE" == "retry-provisional" && -z "$CHAPTER_IDS" ]]; then
  echo "retry-provisional requires comma-separated chapter UUIDs as arg 3" >&2
  exit 1
fi

echo "Running generator ($MODE)..."
compose run --rm --no-deps \
  --entrypoint "" \
  -e "CHAPTER_TEACHING_PACK_CURSOR_TIMEOUT_MS=${CHAPTER_TEACHING_PACK_CURSOR_TIMEOUT_MS:-}" \
  -v "$REPO/backend:/app" \
  -w /app \
  backend sh -c "if [ ! -d node_modules/@prisma/client ]; then npm ci; fi; npx prisma generate; npx ts-node $GEN_ARGS"

echo "Done."
