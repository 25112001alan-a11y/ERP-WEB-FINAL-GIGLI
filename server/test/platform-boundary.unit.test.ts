import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken, signPlatformToken, verifyToken, verifyPlatformToken } from '../src/lib/jwt.js';

test('platform and tenant tokens never cross HTTP boundaries even with matching numeric IDs', async () => {
  const userLookup = mock.fn(async () => ({
    id: 1, companyId: 1, email: 'tenant@example.test', status: 'Activo',
    branchId: null, roles: [{ roleId: 1 }],
  }));
  const platformLookup = mock.fn(async () => ({
    id: 1, status: 'Activo',
  }));
  Object.defineProperty(prisma.user, 'findUnique', { value: userLookup, configurable: true });
  Object.defineProperty(prisma.platformUser, 'findUnique', { value: platformLookup, configurable: true });
  const tenant = signToken({ sub: 1, companyId: 1, email: 'tenant@example.test' });
  const platform = signPlatformToken(1);
  assert.throws(() => verifyToken(platform));
  assert.throws(() => verifyPlatformToken(tenant));

  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const get = async (path: string, token: string) => (await fetch(`${base}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    })).status;

    assert.equal(await get('/api/auth/me', platform), 401);
    assert.equal(await get('/api/billing/subscription', platform), 401);
    assert.equal(await get('/api/users/roles', platform), 401);
    assert.equal(userLookup.mock.callCount(), 0);
    assert.equal(await get('/api/billing/admin/overview', tenant), 403);
    assert.equal(platformLookup.mock.callCount(), 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    Reflect.deleteProperty(prisma.user, 'findUnique');
    Reflect.deleteProperty(prisma.platformUser, 'findUnique');
  }
});

test('platform guard rejects absent or disabled persisted principals', async () => {
  const lookup = mock.fn(async (): Promise<{ id: number; status: string } | null> => null);
  Object.defineProperty(prisma.platformUser, 'findUnique', { value: lookup, configurable: true });
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/billing/admin/overview`;
    const get = async () => (await fetch(url, {
      headers: { authorization: `Bearer ${signPlatformToken(1)}` },
    })).status;
    assert.equal(await get(), 401);
    lookup.mock.mockImplementation(async () => ({ id: 1, status: 'Inactivo' }));
    assert.equal(await get(), 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    Reflect.deleteProperty(prisma.platformUser, 'findUnique');
  }
});

test('active platform principal reaches overview without tenant role lookup', async () => {
  const platformLookup = mock.fn(async () => ({ id: 1, status: 'Activo' }));
  const tenantLookup = mock.fn(async () => { throw new Error('Tenant lookup must not run'); });
  const groupBy = mock.fn(async () => []);
  const subscriptions = mock.fn(async () => []);
  const events = mock.fn(async () => []);
  const companies = mock.fn(async () => []);
  const count = mock.fn(async () => 0);
  const stubs: [object, string, Function][] = [
    [prisma.platformUser, 'findUnique', platformLookup],
    [prisma.user, 'findUnique', tenantLookup],
    [prisma.companySubscription, 'groupBy', groupBy],
    [prisma.companySubscription, 'findMany', subscriptions],
    [prisma.billingEvent, 'findMany', events],
    [prisma.company, 'findMany', companies],
    [prisma.company, 'count', count],
  ];
  for (const [delegate, method, fn] of stubs) {
    Object.defineProperty(delegate, method, { value: fn, configurable: true });
  }
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/billing/admin/overview`;
    const response = await fetch(url, { headers: { authorization: `Bearer ${signPlatformToken(1)}` } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).totals.companies, 0);
    assert.equal(tenantLookup.mock.callCount(), 0);
    assert.equal(platformLookup.mock.callCount(), 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [delegate, method] of stubs) Reflect.deleteProperty(delegate, method);
  }
});
