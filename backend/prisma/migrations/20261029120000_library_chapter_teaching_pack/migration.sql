-- CreateTable
CREATE TABLE `library_chapter_teaching_packs` (
    `id` VARCHAR(191) NOT NULL,
    `library_book_chapter_id` VARCHAR(191) NOT NULL,
    `content_hash` VARCHAR(64) NOT NULL,
    `complexity` VARCHAR(16) NOT NULL,
    `summary` LONGTEXT NOT NULL,
    `teacher_guide` JSON NOT NULL,
    `source` ENUM('AI', 'PROVISIONAL') NOT NULL,
    `warnings` JSON NULL,
    `prompt_version` VARCHAR(64) NOT NULL,
    `generated_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `library_chapter_teaching_packs_library_book_chapter_id_key`(`library_book_chapter_id`),
    INDEX `library_chapter_teaching_packs_content_hash_idx`(`content_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `library_chapter_reading_slices` (
    `id` VARCHAR(191) NOT NULL,
    `pack_id` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `slice_key` VARCHAR(16) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `reading_from` LONGTEXT NOT NULL,
    `reading_to` LONGTEXT NULL,
    `explain_points` JSON NOT NULL,

    INDEX `library_chapter_reading_slices_pack_id_sort_order_idx`(`pack_id`, `sort_order`),
    UNIQUE INDEX `library_chapter_reading_slices_pack_id_slice_key_key`(`pack_id`, `slice_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `library_chapter_question_items` (
    `id` VARCHAR(191) NOT NULL,
    `pack_id` VARCHAR(191) NOT NULL,
    `slice_key` VARCHAR(16) NULL,
    `sort_order` INTEGER NOT NULL,
    `question` LONGTEXT NOT NULL,
    `expected_answer` LONGTEXT NOT NULL,
    `format` VARCHAR(20) NOT NULL,

    INDEX `library_chapter_question_items_pack_id_sort_order_idx`(`pack_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `library_chapter_activity_items` (
    `id` VARCHAR(191) NOT NULL,
    `pack_id` VARCHAR(191) NOT NULL,
    `slice_key` VARCHAR(16) NULL,
    `sort_order` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `participation_technique` LONGTEXT NOT NULL,
    `materials` TEXT NULL,

    INDEX `library_chapter_activity_items_pack_id_sort_order_idx`(`pack_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `library_chapter_revision_points` (
    `id` VARCHAR(191) NOT NULL,
    `pack_id` VARCHAR(191) NOT NULL,
    `slice_key` VARCHAR(16) NULL,
    `sort_order` INTEGER NOT NULL,
    `point` LONGTEXT NOT NULL,

    INDEX `library_chapter_revision_points_pack_id_sort_order_idx`(`pack_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `library_chapter_teaching_packs` ADD CONSTRAINT `library_chapter_teaching_packs_library_book_chapter_id_fkey` FOREIGN KEY (`library_book_chapter_id`) REFERENCES `library_book_chapters`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `library_chapter_reading_slices` ADD CONSTRAINT `library_chapter_reading_slices_pack_id_fkey` FOREIGN KEY (`pack_id`) REFERENCES `library_chapter_teaching_packs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `library_chapter_question_items` ADD CONSTRAINT `library_chapter_question_items_pack_id_fkey` FOREIGN KEY (`pack_id`) REFERENCES `library_chapter_teaching_packs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `library_chapter_activity_items` ADD CONSTRAINT `library_chapter_activity_items_pack_id_fkey` FOREIGN KEY (`pack_id`) REFERENCES `library_chapter_teaching_packs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `library_chapter_revision_points` ADD CONSTRAINT `library_chapter_revision_points_pack_id_fkey` FOREIGN KEY (`pack_id`) REFERENCES `library_chapter_teaching_packs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
