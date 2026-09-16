-- Teacher check-in timestamps + late/absent cut-off times.
-- Run once in MySQL Workbench against the school database.

ALTER TABLE school_settings
  ADD COLUMN teacher_late_after VARCHAR(5) NOT NULL DEFAULT '08:15',
  ADD COLUMN teacher_absent_after VARCHAR(5) NOT NULL DEFAULT '09:00';

ALTER TABLE teacher_attendances
  ADD COLUMN checked_in_at DATETIME(3) NULL,
  ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN external_id VARCHAR(80) NULL;

ALTER TABLE teacher_attendances
  MODIFY recorded_by_id VARCHAR(191) NULL;
