-- OCR teacher verification and training pool

ALTER TABLE `lesson_sources`
  ADD COLUMN `verified_ocr_text` LONGTEXT NULL,
  ADD COLUMN `ocr_review_status` ENUM('NONE', 'DRAFT', 'VERIFIED') NOT NULL DEFAULT 'NONE',
  ADD COLUMN `verified_at` DATETIME(3) NULL,
  ADD COLUMN `verified_by_user_id` VARCHAR(191) NULL,
  ADD INDEX `lesson_sources_ocr_review_status_idx` (`ocr_review_status`);

ALTER TABLE `lesson_sources`
  ADD CONSTRAINT `lesson_sources_verified_by_user_id_fkey`
    FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `ocr_training_examples` (
  `id` VARCHAR(191) NOT NULL,
  `school_id` VARCHAR(191) NOT NULL,
  `lesson_source_id` VARCHAR(191) NOT NULL,
  `file_asset_id` VARCHAR(191) NULL,
  `region_type` VARCHAR(191) NOT NULL DEFAULT 'full_page',
  `label` LONGTEXT NOT NULL,
  `paddle_text` LONGTEXT NULL,
  `tesseract_text` LONGTEXT NULL,
  `merged_text` LONGTEXT NULL,
  `split_group` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
  `approved_by_user_id` VARCHAR(191) NULL,
  `approved_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `engine_meta` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ocr_training_examples_school_id_idx` (`school_id`),
  INDEX `ocr_training_examples_lesson_source_id_idx` (`lesson_source_id`),
  INDEX `ocr_training_examples_status_idx` (`status`),
  INDEX `ocr_training_examples_split_group_idx` (`split_group`),
  CONSTRAINT `ocr_training_examples_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ocr_training_examples_lesson_source_id_fkey` FOREIGN KEY (`lesson_source_id`) REFERENCES `lesson_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ocr_training_examples_file_asset_id_fkey` FOREIGN KEY (`file_asset_id`) REFERENCES `file_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ocr_training_examples_approved_by_user_id_fkey` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ocr_model_releases` (
  `id` VARCHAR(191) NOT NULL,
  `role` ENUM('PRODUCTION', 'CANDIDATE', 'ARCHIVED') NOT NULL,
  `version` VARCHAR(191) NOT NULL,
  `artifact_path` VARCHAR(191) NOT NULL,
  `metrics` JSON NULL,
  `dataset_version` VARCHAR(191) NULL,
  `promoted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `notes` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `ocr_model_releases_role_idx` (`role`),
  INDEX `ocr_model_releases_version_idx` (`version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
