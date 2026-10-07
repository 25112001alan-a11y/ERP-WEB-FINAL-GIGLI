-- Receipt commands use a stable, client-generated UUID so transport retries
-- cannot create duplicate remitos, stock movements or audit entries.
ALTER TABLE `comprobantes`
  ADD COLUMN `idempotencyKey` VARCHAR(64) NULL,
  ADD COLUMN `receiptFingerprint` CHAR(64) NULL;

CREATE UNIQUE INDEX `comprobantes_companyId_idempotencyKey_key`
  ON `comprobantes`(`companyId`, `idempotencyKey`);
