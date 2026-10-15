import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signPlatformToken, signToken } from '../src/lib/jwt.js';

// GET /companies/:id now returns the full profile plus the SaaS subscription,
// and two read-only audit feeds expose what platform staff did (globally and
// per company). All three are platform-only surfaces.
test('ECO company 360 detail, per-company audit and global audit feed', async () => {
  const company = {
    id: 9, name: 'Acme', slug: 'acme', legalName: 'Acme SA', taxId: '30-1-9', address: null,
    province: null, postalCode: null, taxCondition: null, currency: 'ARS', timezone: null,
    createdAt: new Date('2026-02-01T00:00:00Z'), updatedAt: new Date('2026-02-02T00:00:00Z'),
    subscription: {
      status: 'active', currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
      plan: { code: 'pro', name: 'Profesional', priceMonthly: 29 },
    },
  };
  const principal = mock.fn(async () => ({ id: 7, email: 'staff@example.test', status: 'Activo' }));
  const companyFind = mock.fn(async ({ where }: { where: { id: number } }) => (where.id === 9 ? company : null));
  const auditFind = mock.fn(async (args: { where?: { targetCompanyId?: number } }) => (
    args.where
      ? [{ id: 2, action: 'company.updated', createdAt: new Date('2026-02-02T00:00:00Z'), platformUser: { email: 'staff@example.test' } }]
      : [{ id: 3, action: 'company.created', createdAt: new Date('2026-02-01T00:00:00Z'), platformUser: { email: 'staff@example.test' }, targetCompany: { id: 9, name: 'Acme', slug: 'acme' } }]
  ));
  const auditCount = mock.fn(async () => 1);
  const stubs: [object, string, Function][] = [
    [prisma.platformUser, 'findUnique', principal],
    [prisma.company, 'findUnique', companyFind],
    [prisma.platformAuditEvent, 'findMany', auditFind],
    [prisma.platformAuditEvent, 'count', auditCount],
  ];
  for (const [delegate, method, fn] of stubs) Object.defineProperty(delegate, method, { value: fn, configurable: true });
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/platform`;
    const platform = signPlatformToken(7);
    const tenant = signToken({ sub: 7, companyId: 9, email: 'tenant@example.test' });
    const get = (path: string, token?: string) => fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

    assert.equal((await get('/audit')).status, 401);
    assert.equal((await get('/audit', tenant)).status, 403);
    assert.equal((await get('/companies/9/audit', tenant)).status, 403);

    const detail = await get('/companies/9', platform);
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), {
      ...company, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z',
    });

    assert.equal((await get('/companies/999', platform)).status, 404);
    for (const id of ['abc', '0', '2147483648']) assert.equal((await get(`/companies/${id}/audit`, platform)).status, 400);

    const companyAudit = await get('/companies/9/audit', platform);
    assert.equal(companyAudit.status, 200);
    assert.deepEqual((await companyAudit.json()).data.map((e: { action: string }) => e.action), ['company.updated']);

    const globalAudit = await get('/audit', platform);
    assert.equal(globalAudit.status, 200);
    const body = await globalAudit.json();
    assert.equal(body.total, 1);
    assert.equal(body.page, 1);
    assert.equal(body.data[0].targetCompany.slug, 'acme');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [delegate, method] of stubs) Reflect.deleteProperty(delegate, method);
  }
});
