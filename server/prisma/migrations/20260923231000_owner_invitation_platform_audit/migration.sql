-- CreateTable
CREATE TABLE `invitaciones_dueno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `platformUserId` INTEGER NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `invitaciones_dueno_userId_key`(`userId`),
    UNIQUE INDEX `invitaciones_dueno_tokenHash_key`(`tokenHash`),
    INDEX `invitaciones_dueno_companyId_idx`(`companyId`),
    INDEX `invitaciones_dueno_platformUserId_idx`(`platformUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eventos_auditoria_plataforma` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `platformUserId` INTEGER NOT NULL,
    `targetCompanyId` INTEGER NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `eventos_auditoria_plataforma_platformUserId_idx`(`platformUserId`),
    INDEX `eventos_auditoria_plataforma_targetCompanyId_createdAt_idx`(`targetCompanyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `invitaciones_dueno` ADD CONSTRAINT `invitaciones_dueno_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitaciones_dueno` ADD CONSTRAINT `invitaciones_dueno_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitaciones_dueno` ADD CONSTRAINT `invitaciones_dueno_platformUserId_fkey` FOREIGN KEY (`platformUserId`) REFERENCES `usuarios_plataforma`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_auditoria_plataforma` ADD CONSTRAINT `eventos_auditoria_plataforma_platformUserId_fkey` FOREIGN KEY (`platformUserId`) REFERENCES `usuarios_plataforma`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_auditoria_plataforma` ADD CONSTRAINT `eventos_auditoria_plataforma_targetCompanyId_fkey` FOREIGN KEY (`targetCompanyId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
