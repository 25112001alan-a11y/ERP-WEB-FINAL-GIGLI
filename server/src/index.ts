import 'dotenv/config';
import { runMigrations, ensureSeeded } from './bootstrap.js';
import { app } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

async function start() {
  runMigrations();
  await ensureSeeded();
  app.listen(PORT, () => {
    console.log(`nexus-erp-api listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[bootstrap] startup failed:', err);
  process.exit(1);
});