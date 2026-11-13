-- Structured activity instructions. Existing rows stay valid: every new column is nullable.
ALTER TABLE `library_chapter_activity_items`
    ADD COLUMN `learning_objective` TEXT NULL,
    ADD COLUMN `teacher_steps` JSON NULL,
    ADD COLUMN `expected_outcome` TEXT NULL,
    ADD COLUMN `duration_minutes` INTEGER NULL;
