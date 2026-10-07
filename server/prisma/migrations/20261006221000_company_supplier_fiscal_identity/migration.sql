-- AlterTable
ALTER TABLE `empresas` ADD COLUMN `address` VARCHAR(200) NULL,
    ADD COLUMN `province` VARCHAR(100) NULL,
    ADD COLUMN `postalCode` VARCHAR(20) NULL,
    ADD COLUMN `taxCondition` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `proveedores` ADD COLUMN `address` VARCHAR(200) NULL,
    ADD COLUMN `province` VARCHAR(100) NULL,
    ADD COLUMN `postalCode` VARCHAR(20) NULL,
    ADD COLUMN `taxCondition` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `comprobantes` ADD COLUMN `companyAddress` VARCHAR(200) NULL,
    ADD COLUMN `companyProvince` VARCHAR(100) NULL,
    ADD COLUMN `companyPostalCode` VARCHAR(20) NULL,
    ADD COLUMN `companyTaxCondition` VARCHAR(40) NULL,
    ADD COLUMN `supplierProvince` VARCHAR(100) NULL,
    ADD COLUMN `supplierPostalCode` VARCHAR(20) NULL,
    ADD COLUMN `supplierTaxCondition` VARCHAR(40) NULL;
