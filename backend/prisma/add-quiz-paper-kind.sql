ALTER TABLE quizzes
  ADD COLUMN paper_kind VARCHAR(32) NOT NULL DEFAULT 'QUIZ',
  ADD COLUMN submitted_at DATETIME NULL;

CREATE INDEX quizzes_paper_kind_idx ON quizzes (paper_kind);
