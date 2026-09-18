-- Nexus ERP — SaaS billing: Plan catalog, per-company subscription, idempotent webhook ledger.
-- Written by hand (prisma migrate dev requires a TTY); applied via `prisma migrate deploy`.

CREATE TABLE `planes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(30) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `description` TEXT NULL,
  `price_monthly` DECIMAL(10,2) NOT NULL,
  `features` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `planes_code_key` (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `suscripciones_empresa` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `company_id` INT NOT NULL,
  `plan_id` INT NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `mp_customer_id` VARCHAR(80) NULL,
  `mp_subscription_id` VARCHAR(80) NULL,
  `current_period_start` DATETIME(3) NULL,
  `current_period_end` DATETIME(3) NULL,
  `cancel_at_period_end` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `suscripciones_empresa_company_id_key` (`company_id`),
  KEY `suscripciones_empresa_plan_id_idx` (`plan_id`),
  CONSTRAINT `suscripciones_empresa_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `empresas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `suscripciones_empresa_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `planes` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `eventos_billing` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `event_id` VARCHAR(120) NOT NULL,
  `topic` VARCHAR(40) NOT NULL,
  `payload` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `eventos_billing_event_id_key` (`event_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;