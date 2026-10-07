-- AlterTable
ALTER TABLE `comprobante_items` ADD COLUMN `sku` VARCHAR(50) NULL,
    ADD COLUMN `taxName` VARCHAR(80) NULL;

-- AlterTable
ALTER TABLE `comprobantes` ADD COLUMN `branchAddress` VARCHAR(200) NULL,
    ADD COLUMN `branchName` VARCHAR(100) NULL,
    ADD COLUMN `clientAddress` VARCHAR(200) NULL,
    ADD COLUMN `clientName` VARCHAR(150) NULL,
    ADD COLUMN `clientTaxId` VARCHAR(50) NULL,
    ADD COLUMN `companyName` VARCHAR(200) NULL,
    ADD COLUMN `companyTaxId` VARCHAR(50) NULL,
    ADD COLUMN `supplierAddress` VARCHAR(200) NULL,
    ADD COLUMN `supplierName` VARCHAR(150) NULL,
    ADD COLUMN `supplierTaxId` VARCHAR(50) NULL;
