-- Exam paper assignments, review workflow, question sections, long-answer type

ALTER TABLE quiz_questions
  ADD COLUMN section_label VARCHAR(32) NULL AFTER correct_answer;

CREATE TABLE IF NOT EXISTS exam_paper_assignments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  school_id CHAR(36) NOT NULL,
  exam_config_id CHAR(36) NOT NULL,
  section_id CHAR(36) NOT NULL,
  subject_id CHAR(36) NOT NULL,
  teacher_id CHAR(36) NULL,
  max_marks INT NOT NULL,
  submission_due_at DATETIME(3) NOT NULL,
  question_spec JSON NULL,
  released_at DATETIME(3) NULL,
  assigned_by_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_exam_paper_assignments (exam_config_id, section_id, subject_id),
  KEY idx_exam_paper_assignments_school (school_id),
  KEY idx_exam_paper_assignments_released (released_at),
  CONSTRAINT fk_exam_paper_assignments_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_paper_assignments_exam FOREIGN KEY (exam_config_id) REFERENCES exam_configs(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_paper_assignments_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_paper_assignments_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_paper_assignments_teacher FOREIGN KEY (teacher_id) REFERENCES teacher_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_exam_paper_assignments_assigned_by FOREIGN KEY (assigned_by_id) REFERENCES users(id)
);

ALTER TABLE quizzes
  ADD COLUMN exam_paper_assignment_id CHAR(36) NULL AFTER exam_config_id,
  ADD COLUMN review_status VARCHAR(32) NOT NULL DEFAULT 'NOT_SUBMITTED' AFTER exam_paper_assignment_id,
  ADD COLUMN rejection_reason TEXT NULL AFTER review_status,
  ADD COLUMN reviewed_by_id CHAR(36) NULL AFTER rejection_reason,
  ADD COLUMN reviewed_at DATETIME(3) NULL AFTER reviewed_by_id;

ALTER TABLE quizzes
  ADD CONSTRAINT fk_quizzes_exam_paper_assignment
  FOREIGN KEY (exam_paper_assignment_id) REFERENCES exam_paper_assignments(id) ON DELETE SET NULL;

ALTER TABLE quizzes
  ADD CONSTRAINT fk_quizzes_reviewed_by
  FOREIGN KEY (reviewed_by_id) REFERENCES users(id) ON DELETE SET NULL;
