-- AlterTable
ALTER TABLE `sucursales` ADD COLUMN `defaultWarehouseId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `sucursales` ADD CONSTRAINT `sucursales_defaultWarehouseId_fkey` FOREIGN KEY (`defaultWarehouseId`) REFERENCES `depositos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX `sucursales_defaultWarehouseId_idx` ON `sucursales`(`defaultWarehouseId`);