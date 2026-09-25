-- ZKTeco biometric devices + teacher attendance checkout fields.
-- Run once in MySQL against the HawkNexa database.

ALTER TABLE schools
  ADD COLUMN sync_api_key VARCHAR(120) NULL,
  ADD COLUMN auto_checkout_hours INT NULL DEFAULT 24,
  ADD UNIQUE INDEX schools_sync_api_key_key (sync_api_key);

ALTER TABLE teacher_attendances
  ADD COLUMN checked_out_at DATETIME(3) NULL,
  ADD COLUMN device_user_id VARCHAR(80) NULL,
  ADD COLUMN device_serial_number VARCHAR(80) NULL;

CREATE INDEX teacher_attendances_teacher_id_idx ON teacher_attendances (teacher_id);
CREATE INDEX teacher_attendances_checked_in_at_idx ON teacher_attendances (checked_in_at);

CREATE TABLE biometric_device_configs (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  school_id VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  port INT NOT NULL DEFAULT 4370,
  serial_number VARCHAR(80) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at DATETIME(3) NULL,
  sync_interval_seconds INT NOT NULL DEFAULT 300,
  device_admin_user VARCHAR(80) NULL,
  device_admin_password VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY biometric_device_configs_school_ip_port (school_id, ip_address, port),
  INDEX biometric_device_configs_school_id_idx (school_id),
  CONSTRAINT biometric_device_configs_school_id_fkey
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE biometric_device_users (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  device_config_id VARCHAR(191) NOT NULL,
  device_user_id VARCHAR(80) NOT NULL,
  device_user_name VARCHAR(120) NULL,
  device_badge_id VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY biometric_device_users_device_user (device_config_id, device_user_id),
  INDEX biometric_device_users_device_config_id_idx (device_config_id),
  CONSTRAINT biometric_device_users_device_config_id_fkey
    FOREIGN KEY (device_config_id) REFERENCES biometric_device_configs(id) ON DELETE CASCADE
);

CREATE TABLE biometric_device_user_mappings (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  device_config_id VARCHAR(191) NOT NULL,
  teacher_id VARCHAR(191) NOT NULL,
  device_user_id VARCHAR(80) NOT NULL,
  device_user_name VARCHAR(120) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY biometric_device_user_mappings_device_user (device_config_id, device_user_id),
  UNIQUE KEY biometric_device_user_mappings_teacher (device_config_id, teacher_id),
  INDEX biometric_device_user_mappings_device_config_id_idx (device_config_id),
  INDEX biometric_device_user_mappings_teacher_id_idx (teacher_id),
  CONSTRAINT biometric_device_user_mappings_device_config_id_fkey
    FOREIGN KEY (device_config_id) REFERENCES biometric_device_configs(id) ON DELETE CASCADE,
  CONSTRAINT biometric_device_user_mappings_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES teacher_profiles(id) ON DELETE CASCADE
);

CREATE TABLE pending_biometric_attendance_logs (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  school_id VARCHAR(191) NOT NULL,
  device_config_id VARCHAR(191) NOT NULL,
  device_user_id VARCHAR(80) NOT NULL,
  record_time DATETIME(3) NOT NULL,
  punch_type INT NULL,
  punch_state INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY pending_biometric_punch_unique (device_config_id, device_user_id, record_time),
  INDEX pending_biometric_attendance_logs_school_id_idx (school_id),
  INDEX pending_biometric_attendance_logs_device_user_idx (device_config_id, device_user_id),
  CONSTRAINT pending_biometric_attendance_logs_school_id_fkey
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT pending_biometric_attendance_logs_device_config_id_fkey
    FOREIGN KEY (device_config_id) REFERENCES biometric_device_configs(id) ON DELETE CASCADE
);
