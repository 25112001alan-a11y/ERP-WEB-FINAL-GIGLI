import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signPlatformToken, signToken } from '../src/lib/jwt.js';

test('platform login and me stay separate from tenant auth without a database', async () => {
  const hash = await bcrypt.hash('correct-password', 10);
  const user = { id: 42, email: 'staff@example.test', passwordHash: hash, status: 'Activo' };
  const lookup = mock.fn(async ({ where }: { where: { email?: string; id?: number } }) =>
    where.email === user.email || where.id === user.id ? user : null);
  Object.defineProperty(prisma.platformUser, 'findUnique', { value: lookup, configurable: true });
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const login = (email: string, password: string) => fetch(`${base}/api/platform/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    const me = (token: string) => fetch(`${base}/api/platform/me`, { headers: { authorization: `Bearer ${token}` } });

    const success = await login(user.email, 'correct-password');
    assert.equal(success.status, 200);
    const { token } = await success.json();
    const profile = await me(token);
    assert.equal(profile.status, 200);
    assert.deepEqual(await profile.json(), { id: 42, email: user.email });

    const badPassword = await login(user.email, 'wrong');
    const missing = await login('missing@example.test', 'wrong');
    user.status = 'Inactivo';
    const disabled = await login(user.email, 'correct-password');
    for (const response of [badPassword, missing, disabled]) {
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'Credenciales inválidas' });
    }
    assert.equal((await me(token)).status, 401);
    user.status = 'Activo';

    const tenant = signToken({ sub: user.id, companyId: 1, email: user.email });
    assert.equal((await me(tenant)).status, 403);
    assert.equal((await me('invalid')).status, 401);

    const now = Date.now();
    const clock = mock.method(Date, 'now', () => now - 24 * 60 * 60 * 1000);
    let expired: string;
    try { expired = signPlatformToken(user.id); } finally { clock.mock.restore(); }
    assert.equal((await me(expired)).status, 401);
    assert.equal((await me(token)).status, 200);
    assert.ok(lookup.mock.callCount() >= 6);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    Reflect.deleteProperty(prisma.platformUser, 'findUnique');
  }
});
