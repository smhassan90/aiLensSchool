-- Lesson chapter library + class session workflow
ALTER TABLE `daily_lessons`
  ADD COLUMN `record_kind` ENUM('CHAPTER_LIBRARY', 'CLASS_SESSION') NOT NULL DEFAULT 'CLASS_SESSION',
  ADD COLUMN `session_type` ENUM('NEW_LESSON', 'CONTINUATION', 'REVISION') NULL,
  ADD COLUMN `content_confirmed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `chapter_progress` ENUM('IN_PROGRESS', 'COMPLETED') NULL,
  ADD COLUMN `chapter_source_id` VARCHAR(191) NULL,
  ADD COLUMN `revision_chapter_ids` JSON NULL,
  ADD COLUMN `parent_summary` TEXT NULL;

ALTER TABLE `daily_lessons`
  ADD INDEX `daily_lessons_record_kind_idx` (`record_kind`),
  ADD INDEX `daily_lessons_chapter_source_id_idx` (`chapter_source_id`);

ALTER TABLE `daily_lessons`
  ADD CONSTRAINT `daily_lessons_chapter_source_id_fkey`
  FOREIGN KEY (`chapter_source_id`) REFERENCES `daily_lessons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
