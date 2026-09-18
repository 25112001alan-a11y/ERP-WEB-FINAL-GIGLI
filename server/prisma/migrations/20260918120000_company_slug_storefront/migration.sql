-- Company.slug: public storefront identifier per tenant (F3 multi-tenancy).
-- Nullable for the backfill step; every new company gets a slug at registration.

ALTER TABLE `empresas` ADD COLUMN `slug` VARCHAR(80) NULL;

-- Backfill existing tenants with a deterministic unique slug.
UPDATE `empresas` SET `slug` = CONCAT('empresa-', id) WHERE `slug` IS NULL;

CREATE UNIQUE INDEX `empresas_slug_key` ON `empresas`(`slug`);