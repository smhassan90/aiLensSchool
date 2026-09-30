-- Staff attendance + biometric mapping for non-teacher staff

ALTER TABLE `users` ADD COLUMN `employee_code` VARCHAR(40) NULL;

CREATE UNIQUE INDEX `users_school_id_employee_code_key` ON `users`(`school_id`, `employee_code`);

CREATE TABLE `staff_attendances` (
    `id` VARCHAR(191) NOT NULL,
    `school_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED') NOT NULL,
    `notes` VARCHAR(191) NULL,
    `checked_in_at` DATETIME(3) NULL,
    `checked_out_at` DATETIME(3) NULL,
    `source` VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
    `device_user_id` VARCHAR(80) NULL,
    `device_serial_number` VARCHAR(80) NULL,
    `recorded_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `staff_attendances_user_id_date_key`(`user_id`, `date`),
    INDEX `staff_attendances_school_id_idx`(`school_id`),
    INDEX `staff_attendances_user_id_idx`(`user_id`),
    INDEX `staff_attendances_date_idx`(`date`),
    INDEX `staff_attendances_checked_in_at_idx`(`checked_in_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `staff_attendances` ADD CONSTRAINT `staff_attendances_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `staff_attendances` ADD CONSTRAINT `staff_attendances_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `staff_attendances` ADD CONSTRAINT `staff_attendances_recorded_by_id_fkey` FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `biometric_device_user_mappings` MODIFY `teacher_id` VARCHAR(191) NULL;
ALTER TABLE `biometric_device_user_mappings` ADD COLUMN `staff_user_id` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `bio_map_config_staff_user` ON `biometric_device_user_mappings`(`device_config_id`, `staff_user_id`);

ALTER TABLE `biometric_device_user_mappings` ADD CONSTRAINT `biometric_device_user_mappings_staff_user_id_fkey` FOREIGN KEY (`staff_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
