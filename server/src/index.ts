import 'dotenv/config';
import { runMigrations, ensureSeeded, runDemoSeed } from './bootstrap.js';
import { sweepOrphanAttachments } from './lib/uploads.js';
import { backfillCompanySlugs } from './lib/slug.js';
import { prisma } from './lib/prisma.js';
import { app } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

async function start() {
  runMigrations();
  await ensureSeeded();
  await backfillCompanySlugs(prisma);
  await sweepOrphanAttachments();
  runDemoSeed();
  app.listen(PORT, () => {
    console.log(`nexus-erp-api listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[bootstrap] startup failed:', err);
  process.exit(1);
});