-- Nexus ERP — fix: rename snake_case billing columns to camelCase (Prisma expects camelCase when no @map is set).
-- MySQL: RENAME COLUMN supported in 8.0+ and MariaDB 10.5.5+.

ALTER TABLE `suscripciones_empresa`
  RENAME COLUMN `company_id` TO `companyId`,
  RENAME COLUMN `plan_id` TO `planId`,
  RENAME COLUMN `mp_customer_id` TO `mpCustomerId`,
  RENAME COLUMN `mp_subscription_id` TO `mpSubscriptionId`,
  RENAME COLUMN `current_period_start` TO `currentPeriodStart`,
  RENAME COLUMN `current_period_end` TO `currentPeriodEnd`,
  RENAME COLUMN `cancel_at_period_end` TO `cancelAtPeriodEnd`,
  RENAME COLUMN `created_at` TO `createdAt`,
  RENAME COLUMN `updated_at` TO `updatedAt`;

ALTER TABLE `eventos_billing`
  RENAME COLUMN `event_id` TO `eventId`,
  RENAME COLUMN `created_at` TO `createdAt`;

ALTER TABLE `planes`
  RENAME COLUMN `price_monthly` TO `priceMonthly`,
  RENAME COLUMN `created_at` TO `createdAt`;
