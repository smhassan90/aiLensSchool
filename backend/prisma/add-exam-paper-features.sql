-- Exam paper features: difficulty, exam config link, submission deadline setting
ALTER TABLE quizzes
  ADD COLUMN difficulty INT NULL AFTER paper_kind,
  ADD COLUMN exam_config_id CHAR(36) NULL AFTER difficulty;

ALTER TABLE quizzes
  ADD CONSTRAINT fk_quizzes_exam_config
  FOREIGN KEY (exam_config_id) REFERENCES exam_configs(id) ON DELETE SET NULL;

ALTER TABLE school_settings
  ADD COLUMN exam_submission_days_before INT NOT NULL DEFAULT 5 AFTER teacher_absent_after;
