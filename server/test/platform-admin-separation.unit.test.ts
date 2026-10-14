import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// A platform admin (PlatformUser) is staff, never a company admin. Its email is
// reserved: registering a tenant account with it must fail with the same generic
// 409 as any duplicate, so the response does not disclose platform staff emails.
test('tenant register rejects an email reserved for a platform admin', async () => {
  const email = 'staff@nexus.test';
  const noTenant = async ({ where }: { where: { email: string } }) =>
    where.email === email ? null : null;
  const platformClash = async ({ where }: { where: { email: string } }) =>
    where.email === email ? { id: 7, email, status: 'Activo' } : null;
  Object.defineProperty(prisma.user, 'findUnique', { value: noTenant, configurable: true });
  Object.defineProperty(prisma.platformUser, 'findUnique', { value: platformClash, configurable: true });

  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Clash Co', firstName: 'Plat', lastName: 'Form',
        email, password: 'password123',
      }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'El email ya está registrado' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    Reflect.deleteProperty(prisma.user, 'findUnique');
    Reflect.deleteProperty(prisma.platformUser, 'findUnique');
  }
});
