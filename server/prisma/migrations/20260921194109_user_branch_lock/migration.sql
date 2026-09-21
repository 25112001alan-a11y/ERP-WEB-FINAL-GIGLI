-- DropForeignKey
ALTER TABLE `suscripciones_empresa` DROP FOREIGN KEY `suscripciones_empresa_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `suscripciones_empresa` DROP FOREIGN KEY `suscripciones_empresa_plan_id_fkey`;

-- AlterTable
ALTER TABLE `comprobantes` MODIFY `currency` VARCHAR(3) NOT NULL DEFAULT 'ARS';

-- AlterTable
ALTER TABLE `empresas` MODIFY `currency` VARCHAR(3) NOT NULL DEFAULT 'ARS';

-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `branchId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `usuarios_branchId_idx` ON `usuarios`(`branchId`);

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `sucursales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `suscripciones_empresa` ADD CONSTRAINT `suscripciones_empresa_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `suscripciones_empresa` ADD CONSTRAINT `suscripciones_empresa_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `planes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `clientes` RENAME INDEX `clientes_companyId_fkey` TO `clientes_companyId_idx`;

-- RenameIndex
ALTER TABLE `comprobante_items` RENAME INDEX `comprobante_items_documentId_fkey` TO `comprobante_items_documentId_idx`;

-- RenameIndex
ALTER TABLE `comprobantes` RENAME INDEX `comprobantes_clientId_fkey` TO `comprobantes_clientId_idx`;

-- RenameIndex
ALTER TABLE `comprobantes` RENAME INDEX `comprobantes_supplierId_fkey` TO `comprobantes_supplierId_idx`;

-- RenameIndex
ALTER TABLE `comprobantes` RENAME INDEX `comprobantes_userId_fkey` TO `comprobantes_userId_idx`;

-- RenameIndex
ALTER TABLE `eventos_billing` RENAME INDEX `eventos_billing_event_id_key` TO `eventos_billing_eventId_key`;

-- RenameIndex
ALTER TABLE `movimientos_stocks` RENAME INDEX `movimientos_stocks_documentId_fkey` TO `movimientos_stocks_documentId_idx`;

-- RenameIndex
ALTER TABLE `movimientos_stocks` RENAME INDEX `movimientos_stocks_productId_fkey` TO `movimientos_stocks_productId_idx`;

-- RenameIndex
ALTER TABLE `movimientos_stocks` RENAME INDEX `movimientos_stocks_warehouseFromId_fkey` TO `movimientos_stocks_warehouseFromId_idx`;

-- RenameIndex
ALTER TABLE `movimientos_stocks` RENAME INDEX `movimientos_stocks_warehouseToId_fkey` TO `movimientos_stocks_warehouseToId_idx`;

-- RenameIndex
ALTER TABLE `pagos` RENAME INDEX `pagos_companyId_fkey` TO `pagos_companyId_idx`;

-- RenameIndex
ALTER TABLE `pagos` RENAME INDEX `pagos_documentId_fkey` TO `pagos_documentId_idx`;

-- RenameIndex
ALTER TABLE `proveedores` RENAME INDEX `proveedores_companyId_fkey` TO `proveedores_companyId_idx`;

-- RenameIndex
ALTER TABLE `roles` RENAME INDEX `roles_companyId_fkey` TO `roles_companyId_idx`;

-- RenameIndex
ALTER TABLE `suscripciones_empresa` RENAME INDEX `suscripciones_empresa_company_id_key` TO `suscripciones_empresa_companyId_key`;

-- RenameIndex
ALTER TABLE `usuarios` RENAME INDEX `usuarios_companyId_fkey` TO `usuarios_companyId_idx`;
