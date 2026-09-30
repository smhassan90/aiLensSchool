#!/usr/bin/env bash
# Apply staff_attendance migration on production VPS MySQL (Docker). Idempotent.
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

table_exists() {
  run_sql -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1';"
}

column_exists() {
  run_sql -N -e "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1' AND COLUMN_NAME='$2';"
}

index_exists() {
  run_sql -N -e "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1' AND INDEX_NAME='$2';"
}

if [[ "$(column_exists users employee_code)" != "1" ]]; then
  echo "Adding users.employee_code ..."
  run_sql -e "ALTER TABLE \`users\` ADD COLUMN \`employee_code\` VARCHAR(40) NULL;"
else
  echo "users.employee_code already exists."
fi

if [[ "$(index_exists users users_school_id_employee_code_key)" != "1" ]]; then
  echo "Adding users school+employee_code unique index ..."
  run_sql -e "CREATE UNIQUE INDEX \`users_school_id_employee_code_key\` ON \`users\`(\`school_id\`, \`employee_code\`);"
else
  echo "users_school_id_employee_code_key already exists."
fi

if [[ "$(table_exists staff_attendances)" != "1" ]]; then
  echo "Creating staff_attendances ..."
  run_sql <<'SQL'
CREATE TABLE `staff_attendances` (
    `id` VARCHAR(191) NOT NULL,
    `school_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED') NOT NULL,
    `notes` VARCHAR(191) NULL,
    `checked_in_at` DATETIME(3) NULL,
    `checked_out_at` DATETIME(3) NULL,
    `source` VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
    `device_user_id` VARCHAR(80) NULL,
    `device_serial_number` VARCHAR(80) NULL,
    `recorded_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `staff_attendances_user_id_date_key`(`user_id`, `date`),
    INDEX `staff_attendances_school_id_idx`(`school_id`),
    INDEX `staff_attendances_user_id_idx`(`user_id`),
    INDEX `staff_attendances_date_idx`(`date`),
    INDEX `staff_attendances_checked_in_at_idx`(`checked_in_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SQL
  run_sql -e "ALTER TABLE \`staff_attendances\` ADD CONSTRAINT \`staff_attendances_school_id_fkey\` FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;"
  run_sql -e "ALTER TABLE \`staff_attendances\` ADD CONSTRAINT \`staff_attendances_user_id_fkey\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;"
  run_sql -e "ALTER TABLE \`staff_attendances\` ADD CONSTRAINT \`staff_attendances_recorded_by_id_fkey\` FOREIGN KEY (\`recorded_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;"
else
  echo "staff_attendances already exists."
fi

if [[ "$(column_exists biometric_device_user_mappings staff_user_id)" != "1" ]]; then
  echo "Updating biometric_device_user_mappings ..."
  run_sql -e "ALTER TABLE \`biometric_device_user_mappings\` MODIFY \`teacher_id\` VARCHAR(191) NULL;"
  run_sql -e "ALTER TABLE \`biometric_device_user_mappings\` ADD COLUMN \`staff_user_id\` VARCHAR(191) NULL;"
fi

if [[ "$(index_exists biometric_device_user_mappings bio_map_config_staff_user)" != "1" ]]; then
  run_sql -e "CREATE UNIQUE INDEX \`bio_map_config_staff_user\` ON \`biometric_device_user_mappings\`(\`device_config_id\`, \`staff_user_id\`);"
fi

fk_exists="$(run_sql -N -e "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='biometric_device_user_mappings' AND CONSTRAINT_NAME='biometric_device_user_mappings_staff_user_id_fkey';")"
if [[ "${fk_exists}" != "1" ]]; then
  run_sql -e "ALTER TABLE \`biometric_device_user_mappings\` ADD CONSTRAINT \`biometric_device_user_mappings_staff_user_id_fkey\` FOREIGN KEY (\`staff_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;"
fi

echo "=== Verification ==="
run_sql -e "SHOW TABLES LIKE 'staff_attendances';"
run_sql -e "SHOW COLUMNS FROM users LIKE 'employee_code';"
run_sql -e "SHOW COLUMNS FROM biometric_device_user_mappings LIKE 'staff_user_id';"
echo "OK: staff attendance schema verified on ${MYSQL_DATABASE}."
REMOTE
