#!/usr/bin/env bash
# Apply add-biometric-full-sync.sql on production VPS MySQL (Docker).
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@187.53.141.109}"
DEPLOY_DIR="${VPS_DEPLOY_DIR:-/opt/apps/hawknexa/deploy}"
SQL="ALTER TABLE biometric_device_configs ADD COLUMN full_sync_requested_at DATETIME(3) NULL;"

ssh -o BatchMode=yes -o ConnectTimeout=20 "$VPS_HOST" bash -s <<REMOTE
set -euo pipefail
cd "$DEPLOY_DIR"
MYSQL_DATABASE="\$(grep -m1 '^MYSQL_DATABASE=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_USER="\$(grep -m1 '^MYSQL_USER=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_PASSWORD="\$(grep -m1 '^MYSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')"
exists="\$(docker compose -f docker-compose.prod.yml exec -T mysql mysql -u"\$MYSQL_USER" -p"\$MYSQL_PASSWORD" "\$MYSQL_DATABASE" -N -e \\
  "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='\$MYSQL_DATABASE' AND TABLE_NAME='biometric_device_configs' AND COLUMN_NAME='full_sync_requested_at';")"
if [[ "\$exists" == "1" ]]; then
  echo "Column full_sync_requested_at already exists — nothing to do."
  exit 0
fi
docker compose -f docker-compose.prod.yml exec -T mysql mysql -u"\$MYSQL_USER" -p"\$MYSQL_PASSWORD" "\$MYSQL_DATABASE" -e "$SQL"
echo "Added full_sync_requested_at to biometric_device_configs."
REMOTE
