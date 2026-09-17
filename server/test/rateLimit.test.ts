import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { makeRateLimiter } from '../src/middleware/rateLimit.js';

// Re-enable limiting for this file: test/setup.ts disables it globally, but this
// suite is the one that must observe the limiter actually working.
process.env.RATE_LIMIT_DISABLED = 'false';

/** Boots a throwaway server with a strict limiter, mirroring app.ts wiring. */
async function withServer(
  limit: number,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    '/api',
    makeRateLimiter({ windowMs: 60_000, limit, message: 'Demasiadas solicitudes.' }),
  );
  app.get('/api/ping', (_req, res) => {
    res.json({ ok: true });
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('rate limiter allows up to the limit and then blocks with 429', async () => {
  await withServer(3, async (base) => {
    for (let i = 0; i < 3; i += 1) {
      const res = await fetch(`${base}/api/ping`);
      assert.equal(res.status, 200, `request ${i + 1} must pass`);
    }

    const blocked = await fetch(`${base}/api/ping`);
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.error, 'Demasiadas solicitudes.');
  });
});

test('rate limiter sets standard draft-7 headers', async () => {
  await withServer(2, async (base) => {
    const res = await fetch(`${base}/api/ping`);
    assert.equal(res.status, 200);
    // draft-7 exposes one combined header plus the policy declaration.
    assert.match(res.headers.get('ratelimit') ?? '', /^limit=2, remaining=1, reset=\d+$/);
    assert.equal(res.headers.get('ratelimit-policy'), '2;w=60');
  });
});
