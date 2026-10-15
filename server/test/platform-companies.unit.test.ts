import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signPlatformToken, signToken } from '../src/lib/jwt.js';

test('platform companies expose only selected fields with bounded database pagination', async () => {
  const principal = mock.fn(async () => ({ id: 1, email: 'platform@example.test', status: 'Activo' }));
  const tenantLookup = mock.fn(async () => { throw new Error('Tenant lookup must not run'); });
  const rows = [
    { id: 2, name: 'Second', slug: 'second', currency: 'ARS' },
    { id: 1, name: 'First', slug: 'first', currency: 'ARS' },
  ];
  const findMany = mock.fn(async ({ select, orderBy, skip, take }: {
    select: Record<string, boolean>; orderBy: { id: string }; skip: number; take: number;
  }) => {
    assert.deepEqual(select, { id: true, name: true, slug: true, currency: true });
    assert.deepEqual(orderBy, { id: 'asc' });
    return rows.toSorted((a, b) => a.id - b.id).slice(skip, skip + take);
  });
  const findUnique = mock.fn(async ({ where, select }: { where: { id: number }; select: Record<string, unknown> }) => {
    assert.deepEqual(select, {
      id: true, name: true, slug: true, legalName: true, taxId: true, address: true,
      province: true, postalCode: true, taxCondition: true, currency: true, timezone: true,
      createdAt: true, updatedAt: true,
      subscription: { select: { status: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, plan: { select: { code: true, name: true, priceMonthly: true } } } },
    });
    return where.id === 1 ? {
      id: 1, name: 'First', slug: 'first', legalName: 'First Ltd', taxId: null, address: null,
      province: null, postalCode: null, taxCondition: null, currency: 'ARS', timezone: null,
      createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z'),
      subscription: { status: 'active', currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, plan: { code: 'free', name: 'Gratis', priceMonthly: 0 } },
    } : null;
  });
  const count = mock.fn(async () => 2);
  const stubs: [object, string, Function][] = [
    [prisma.platformUser, 'findUnique', principal], [prisma.user, 'findUnique', tenantLookup],
    [prisma.company, 'findMany', findMany], [prisma.company, 'findUnique', findUnique], [prisma.company, 'count', count],
  ];
  for (const [delegate, method, fn] of stubs) Object.defineProperty(delegate, method, { value: fn, configurable: true });
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/platform/companies`;
    const get = (path: string, token?: string) => fetch(`${base}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    const platform = signPlatformToken(1);
    const tenant = signToken({ sub: 1, companyId: 1, email: 'tenant@example.test' });

    for (const path of ['', '/1']) {
      assert.equal((await get(path)).status, 401);
      assert.equal((await get(path, 'invalid')).status, 401);
      assert.equal((await get(path, tenant)).status, 403);
    }
    assert.equal(principal.mock.callCount(), 0);
    assert.equal(findMany.mock.callCount(), 0);
    assert.equal(findUnique.mock.callCount(), 0);
    assert.equal(tenantLookup.mock.callCount(), 0);

    const list = await get('', platform);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { data: [rows[1], rows[0]], page: 1, limit: 50, total: 2 });
    assert.deepEqual(findMany.mock.calls[0].arguments[0].skip, 0);
    assert.deepEqual(findMany.mock.calls[0].arguments[0].take, 50);
    const next = await get('?page=2&limit=1', platform);
    assert.deepEqual(await next.json(), { data: [rows[0]], page: 2, limit: 1, total: 2 });
    assert.deepEqual(findMany.mock.calls[1].arguments[0].skip, 1);
    const capped = await get('?limit=9999', platform);
    assert.equal((await capped.json()).limit, 200);
    assert.equal(findMany.mock.calls[2].arguments[0].take, 200);

    for (const path of ['?page=0', '?limit=bad', '?page=999999999']) {
      assert.equal((await get(path, platform)).status, 400);
    }
    for (const path of ['/abc', '/0', '/2147483648']) assert.equal((await get(path, platform)).status, 400);
    assert.equal(findMany.mock.callCount(), 3);
    assert.equal(findUnique.mock.callCount(), 0);

    const detail = await get('/1', platform);
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), {
      id: 1, name: 'First', slug: 'first', legalName: 'First Ltd', taxId: null, address: null,
      province: null, postalCode: null, taxCondition: null, currency: 'ARS', timezone: null,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      subscription: { status: 'active', currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, plan: { code: 'free', name: 'Gratis', priceMonthly: 0 } },
    });
    assert.equal((await get('/999', platform)).status, 404);
    assert.equal(count.mock.callCount(), 3);
    assert.equal(tenantLookup.mock.callCount(), 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [delegate, method] of stubs) Reflect.deleteProperty(delegate, method);
  }
});

test('platform company filters build the where clause and reject invalid values', async () => {
  const principal = mock.fn(async () => ({ id: 1, email: 'platform@example.test', status: 'Activo' }));
  const seen: unknown[] = [];
  const findMany = mock.fn(async ({ where }: { where: unknown }) => { seen.push(where); return []; });
  const count = mock.fn(async ({ where }: { where: unknown }) => { assert.deepEqual(where, seen.at(-1)); return 0; });
  const stubs: [object, string, Function][] = [
    [prisma.platformUser, 'findUnique', principal], [prisma.company, 'findMany', findMany], [prisma.company, 'count', count],
  ];
  for (const [delegate, method, fn] of stubs) Object.defineProperty(delegate, method, { value: fn, configurable: true });
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/platform/companies`;
    const platform = signPlatformToken(1);
    const get = (path: string) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${platform}` } });

    assert.equal((await get('')).status, 200);
    assert.equal((await get('?q=nexus')).status, 200);
    assert.equal((await get('?status=past_due')).status, 200);
    assert.equal((await get('?plan=pro')).status, 200);
    assert.equal((await get('?q=a&status=active&plan=free')).status, 200);
    assert.deepEqual(seen, [
      {},
      { OR: [{ name: { contains: 'nexus' } }, { slug: { contains: 'nexus' } }] },
      { subscription: { is: { status: 'past_due' } } },
      { subscription: { is: { plan: { is: { code: 'pro' } } } } },
      { OR: [{ name: { contains: 'a' } }, { slug: { contains: 'a' } }], subscription: { is: { status: 'active', plan: { is: { code: 'free' } } } } },
    ]);
    const callsBefore = findMany.mock.callCount();
    for (const path of ['?status=nope', `?q=${'x'.repeat(121)}`, '?plan=' + 'p'.repeat(31)]) {
      assert.equal((await get(path)).status, 400, path);
    }
    assert.equal(findMany.mock.callCount(), callsBefore);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [delegate, method] of stubs) Reflect.deleteProperty(delegate, method);
  }
});
