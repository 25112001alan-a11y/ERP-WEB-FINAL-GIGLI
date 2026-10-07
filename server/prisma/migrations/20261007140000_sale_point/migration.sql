-- CreateTable
CREATE TABLE `puntos_venta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `companyId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `number` INTEGER NOT NULL,
    `name` VARCHAR(80) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `puntos_venta_companyId_number_key` ON `puntos_venta`(`companyId`, `number`);

-- AddForeignKey
ALTER TABLE `puntos_venta` ADD CONSTRAINT `puntos_venta_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `puntos_venta` ADD CONSTRAINT `puntos_venta_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `sucursales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one PV (0001) per company so every tenant starts with a usable
-- point of sale (the number is unique per company, so two branches of the same
-- company cannot both take 0001; extra PVs are added from the UI). Documents
-- issued before this migration keep their free snapshot numbers untouched.
INSERT INTO `puntos_venta` (`companyId`, `branchId`, `number`, `name`)
SELECT `companyId`, MIN(`id`), 1, 'Punto de venta principal'
FROM `sucursales`
GROUP BY `companyId`;