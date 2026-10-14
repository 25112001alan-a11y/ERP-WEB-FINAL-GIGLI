// Idempotent NEXUS platform-admin bootstrap (safe to run at every boot).
//
// A platform admin is a row in `usuarios_plataforma` (PlatformUser): same login
// as tenants but a distinct principal, token audience and guard. It has NO
// companyId, so it can never be a company admin.
//
// Credentials come from the environment:
//   PLATFORM_ADMIN_EMAIL     e.g. admin@nexus.test
//   PLATFORM_ADMIN_PASSWORD  min 8 chars
// If either is missing this script is a no-op (so bootstrap can always call it).
//
// Run manually:  npx tsx prisma/seed-platform-admin.ts   (from server/)

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('[platform-admin] PLATFORM_ADMIN_EMAIL/PASSWORD not set — skipping');
    return;
  }
  if (password.length < 8) {
    throw new Error('[platform-admin] PLATFORM_ADMIN_PASSWORD must be at least 8 characters');
  }

  // A platform admin must never be a company admin: if a tenant already owns
  // this email, refuse instead of creating a colliding identity.
  const tenant = await prisma.user.findUnique({ where: { email } });
  if (tenant) {
    throw new Error(
      `[platform-admin] ${email} already belongs to a company user — refusing to create a platform admin`,
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.platformUser.upsert({
    where: { email },
    update: { passwordHash, status: 'Activo' },
    create: { email, passwordHash, status: 'Activo' },
    select: { id: true, email: true },
  });
  console.log(`[platform-admin] ready: ${admin.email} (id=${admin.id})`);
}

main()
  .catch((error) => {
    console.error('[platform-admin] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
