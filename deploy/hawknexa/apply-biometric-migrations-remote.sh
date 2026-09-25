#!/usr/bin/env bash
set -eu
cd /opt/apps/hawknexa/deploy
MYSQL_DATABASE="$(grep -m1 '^MYSQL_DATABASE=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_USER="$(grep -m1 '^MYSQL_USER=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_PASSWORD="$(grep -m1 '^MYSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')"
run_sql() {
  docker compose -f docker-compose.prod.yml exec -T mysql \
    mysql -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" "$@"
}
if ! run_sql -N -e "SHOW TABLES LIKE 'biometric_device_configs';" | grep -q biometric_device_configs; then
  echo "Applying add-biometric-devices.sql ..."
  sed 's/\r$//' /tmp/add-biometric-devices.sql | run_sql
else
  echo "biometric_device_configs already exists — skipping base migration."
fi
exists="$(run_sql -N -e "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='biometric_device_configs' AND COLUMN_NAME='full_sync_requested_at';")"
if [[ "${exists}" == "1" ]]; then
  echo "full_sync_requested_at already exists."
else
  echo "Applying add-biometric-full-sync.sql ..."
  sed 's/\r$//' /tmp/add-biometric-full-sync.sql | run_sql
fi
echo "Done."
