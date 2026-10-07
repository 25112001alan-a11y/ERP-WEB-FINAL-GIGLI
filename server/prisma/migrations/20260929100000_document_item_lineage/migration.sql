ALTER TABLE `comprobante_items`
  ADD COLUMN `sourceDocumentItemId` INTEGER NULL,
  ADD INDEX `comprobante_items_sourceDocumentItemId_idx` (`sourceDocumentItemId`),
  ADD CONSTRAINT `comprobante_items_sourceDocumentItemId_fkey`
    FOREIGN KEY (`sourceDocumentItemId`) REFERENCES `comprobante_items` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
