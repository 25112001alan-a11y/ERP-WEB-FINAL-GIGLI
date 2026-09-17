-- AlterTable
ALTER TABLE `impuestos` ADD COLUMN `companyId` INTEGER NULL;

-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `failedAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lockedUntil` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `comprobantes_contadores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `type` ENUM('OC', 'COMPRA', 'VENTA', 'COTIZACION', 'REMITO', 'PEDIDO', 'FACTURA') NOT NULL,
    `series` VARCHAR(10) NOT NULL,
    `nextNumber` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `comprobantes_contadores_companyId_type_series_key`(`companyId`, `type`, `series`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `impuestos_companyId_idx` ON `impuestos`(`companyId`);

-- AddForeignKey
ALTER TABLE `impuestos` ADD CONSTRAINT `impuestos_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comprobantes_contadores` ADD CONSTRAINT `comprobantes_contadores_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
