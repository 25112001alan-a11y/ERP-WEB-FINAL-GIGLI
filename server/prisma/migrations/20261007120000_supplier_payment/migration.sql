-- AlterTable
ALTER TABLE `proveedores` ADD COLUMN `iibb` VARCHAR(80) NULL,
    ADD COLUMN `paymentAlias` VARCHAR(50) NULL,
    ADD COLUMN `paymentTerms` VARCHAR(80) NULL;