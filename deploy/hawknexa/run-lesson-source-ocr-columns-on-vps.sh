#!/usr/bin/env bash
# Add paddle/tesseract/merged OCR columns on lesson_sources (idempotent).
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@187.53.141.109}"

ssh -o ConnectTimeout=30 "$VPS_HOST" bash -s <<'REMOTE'
set -euo pipefail
cd "/opt/apps/hawknexa/deploy"
MYSQL_DATABASE="$(grep -m1 '^MYSQL_DATABASE=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_USER="$(grep -m1 '^MYSQL_USER=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_PASSWORD="$(grep -m1 '^MYSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')"

run_sql() {
  docker compose -f docker-compose.prod.yml exec -T mysql \
    mysql -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" "$@"
}

column_exists() {
  run_sql -N -e "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1' AND COLUMN_NAME='$2';"
}

for col in paddle_ocr_text tesseract_ocr_text merged_ocr_text; do
  if [[ "$(column_exists lesson_sources "$col")" != "1" ]]; then
    echo "Adding lesson_sources.${col} ..."
    run_sql -e "ALTER TABLE \`lesson_sources\` ADD COLUMN \`${col}\` LONGTEXT NULL;"
  else
    echo "lesson_sources.${col} already exists."
  fi
done
REMOTE
