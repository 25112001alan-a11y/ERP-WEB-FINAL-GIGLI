-- AlterTable
ALTER TABLE `facturas_datos` ADD COLUMN `confirmedAt` DATETIME(3) NULL;

-- Backfill: every capture already verified by a user is a confirmed capture.
UPDATE `facturas_datos` SET `confirmedAt` = CURRENT_TIMESTAMP(3) WHERE `confirmedAt` IS NULL AND `verifiedByUserId` IS NOT NULL;
