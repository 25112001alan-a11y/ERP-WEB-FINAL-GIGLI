import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

// Startup bootstrap designed for serverless/managed hosts (Railway) where a
// shell console may have no node/npm available. All commands run with the
// already-installed production dependencies (prisma, tsx live in `dependencies`).

const CWD = process.cwd();
const PRISMA_CLI = path.join(CWD, 'node_modules', 'prisma', 'build', 'index.js');
const TSX_CLI = path.join(CWD, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** Applies pending Prisma migrations. Idempotent: no-ops when DB is up to date. */
export function runMigrations(): void {
  if (process.env.SKIP_MIGRATIONS === 'true') {
    console.log('[bootstrap] SKIP_MIGRATIONS=true — skipping migrate deploy');
    return;
  }
  console.log('[bootstrap] applying migrations...');
  execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], { stdio: 'inherit', cwd: CWD });
  console.log('[bootstrap] migrations OK');
}

/** Seeds demo data ONLY when the database is empty. Never touches existing data. */
export async function ensureSeeded(): Promise<void> {
  if (process.env.SKIP_SEED === 'true') {
    console.log('[bootstrap] SKIP_SEED=true — skipping seed');
    return;
  }
  const prisma = new PrismaClient();
  try {
    const companies = await prisma.company.count();
    if (companies > 0) {
      console.log(`[bootstrap] database already has data (${companies} companies) — seed skipped`);
      return;
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log('[bootstrap] empty database — running seed...');
  execFileSync(process.execPath, [TSX_CLI, 'prisma/seed.ts'], { stdio: 'inherit', cwd: CWD });
  console.log('[bootstrap] seed complete');
}