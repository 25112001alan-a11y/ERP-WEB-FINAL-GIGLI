-- AlterTable
ALTER TABLE `comprobantes` ADD COLUMN `externalNumber` VARCHAR(50) NULL,
    MODIFY `type` ENUM('OC', 'COMPRA', 'VENTA', 'COTIZACION', 'REMITO', 'PEDIDO', 'FACTURA') NOT NULL;

-- CreateTable
CREATE TABLE `facturas_datos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `documentId` INTEGER NOT NULL,
    `invoiceType` VARCHAR(10) NOT NULL,
    `cae` VARCHAR(14) NULL,
    `caeDueDate` DATETIME(3) NULL,
    `puntoVenta` INTEGER NULL,

    UNIQUE INDEX `facturas_datos_documentId_key`(`documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `facturas_datos` ADD CONSTRAINT `facturas_datos_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `comprobantes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
