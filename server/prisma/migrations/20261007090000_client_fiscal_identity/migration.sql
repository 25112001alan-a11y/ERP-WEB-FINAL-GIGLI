-- AlterTable
ALTER TABLE `clientes` ADD COLUMN `province` VARCHAR(100) NULL,
    ADD COLUMN `postalCode` VARCHAR(20) NULL,
    ADD COLUMN `taxCondition` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `comprobantes` ADD COLUMN `clientProvince` VARCHAR(100) NULL,
    ADD COLUMN `clientPostalCode` VARCHAR(20) NULL,
    ADD COLUMN `clientTaxCondition` VARCHAR(40) NULL;