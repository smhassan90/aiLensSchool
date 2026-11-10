-- Assign one shared library book per class subject (grade-level subject row).
ALTER TABLE `subjects` ADD COLUMN `library_book_id` VARCHAR(191) NULL;
CREATE INDEX `subjects_library_book_id_idx` ON `subjects`(`library_book_id`);
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_library_book_id_fkey` FOREIGN KEY (`library_book_id`) REFERENCES `library_books`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
