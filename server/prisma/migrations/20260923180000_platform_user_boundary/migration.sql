-- CreateTable
CREATE TABLE `usuarios_plataforma` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(150) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Activo',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_plataforma_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
