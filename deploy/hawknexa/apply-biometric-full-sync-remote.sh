#!/usr/bin/env bash
set -eu
cd /opt/apps/hawknexa/deploy
MYSQL_DATABASE="$(grep -m1 '^MYSQL_DATABASE=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_USER="$(grep -m1 '^MYSQL_USER=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_PASSWORD="$(grep -m1 '^MYSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')"
exists="$(docker compose -f docker-compose.prod.yml exec -T mysql mysql -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" -N -e \
  "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='biometric_device_configs' AND COLUMN_NAME='full_sync_requested_at';")"
if [[ "${exists}" == "1" ]]; then
  echo "Column full_sync_requested_at already exists."
  exit 0
fi
docker compose -f docker-compose.prod.yml exec -T mysql mysql -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" -e \
  "ALTER TABLE biometric_device_configs ADD COLUMN full_sync_requested_at DATETIME(3) NULL;"
echo "Migration applied: full_sync_requested_at"
