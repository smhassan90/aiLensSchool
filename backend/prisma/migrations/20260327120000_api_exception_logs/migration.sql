-- CreateTable
CREATE TABLE `api_exception_logs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `school_id` VARCHAR(191) NULL,
    `method` VARCHAR(16) NOT NULL,
    `path` VARCHAR(512) NOT NULL,
    `status_code` INTEGER NOT NULL,
    `error_code` VARCHAR(120) NOT NULL,
    `message` TEXT NOT NULL,
    `details` JSON NULL,
    `user_agent` VARCHAR(512) NULL,
    `ip_address` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `api_exception_logs_created_at_idx`(`created_at`),
    INDEX `api_exception_logs_status_code_idx`(`status_code`),
    INDEX `api_exception_logs_school_id_idx`(`school_id`),
    INDEX `api_exception_logs_user_id_idx`(`user_id`),
    INDEX `api_exception_logs_error_code_idx`(`error_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `api_exception_logs` ADD CONSTRAINT `api_exception_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_exception_logs` ADD CONSTRAINT `api_exception_logs_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
