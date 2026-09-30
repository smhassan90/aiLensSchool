set -euo pipefail
cd "/opt/apps/hawknexa/deploy"
MYSQL_DATABASE="$(grep -m1 '^MYSQL_DATABASE=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_USER="$(grep -m1 '^MYSQL_USER=' .env | cut -d= -f2- | tr -d '\r')"
MYSQL_PASSWORD="$(grep -m1 '^MYSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')"
run_sql() {
  docker compose -f docker-compose.prod.yml exec -T mysql \
    mysql -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" "$@"
}
run_sql -e "CREATE UNIQUE INDEX \`bio_map_config_staff_user\` ON \`biometric_device_user_mappings\`(\`device_config_id\`, \`staff_user_id\`);" 2>/dev/null || echo "Index bio_map_config_staff_user already present or created."
fk_exists="$(run_sql -N -e "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='biometric_device_user_mappings' AND CONSTRAINT_NAME='biometric_device_user_mappings_staff_user_id_fkey';")"
if [[ "${fk_exists}" != "1" ]]; then
  run_sql -e "ALTER TABLE \`biometric_device_user_mappings\` ADD CONSTRAINT \`biometric_device_user_mappings_staff_user_id_fkey\` FOREIGN KEY (\`staff_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;"
fi
echo "=== Verification ==="
run_sql -e "SHOW TABLES LIKE 'staff_attendances';"
run_sql -e "SHOW COLUMNS FROM users LIKE 'employee_code';"
run_sql -e "SHOW COLUMNS FROM biometric_device_user_mappings LIKE 'staff_user_id';"
run_sql -e "SHOW INDEX FROM biometric_device_user_mappings WHERE Key_name='bio_map_config_staff_user';"
echo "OK: staff attendance schema verified on ${MYSQL_DATABASE}."
