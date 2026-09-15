-- AlterTable
ALTER TABLE `facturas_datos` ADD COLUMN `attachmentUrl` VARCHAR(500) NULL,
    ADD COLUMN `emissionDate` DATETIME(3) NULL,
    ADD COLUMN `externalSubtotal` DECIMAL(14, 2) NULL,
    ADD COLUMN `externalTax` DECIMAL(14, 2) NULL,
    ADD COLUMN `externalTotal` DECIMAL(14, 2) NULL,
    ADD COLUMN `ingestionMethod` VARCHAR(20) NULL,
    ADD COLUMN `supplierCuit` VARCHAR(20) NULL,
    ADD COLUMN `supplierName` VARCHAR(150) NULL,
    ADD COLUMN `verifiedByUserId` INTEGER NULL,
    MODIFY `invoiceType` VARCHAR(10) NULL;

-- AddForeignKey
ALTER TABLE `facturas_datos` ADD CONSTRAINT `facturas_datos_verifiedByUserId_fkey` FOREIGN KEY (`verifiedByUserId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
