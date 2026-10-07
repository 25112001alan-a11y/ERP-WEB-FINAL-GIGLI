import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signPlatformToken, signToken } from '../src/lib/jwt.js';

test('ECO company edit validates fields and audits only committed changes', async () => {
  const selected = { id: true, name: true, slug: true, legalName: true, currency: true, timezone: true, createdAt: true };
  const initial = {
    id: 41, name: 'Company', slug: 'company', legalName: null, currency: 'ARS', timezone: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  let stored = { ...initial };
  let missing = false;
  let deletedDuringUpdate = false;
  let auditFailure = false;
  const writes: { kind: string; data: Record<string, unknown> }[] = [];
  const committedAudit: Record<string, unknown>[] = [];
  const transaction = mock.fn(async (fn: (tx: object) => Promise<unknown>) => {
    let pending = stored;
    let pendingAudit: Record<string, unknown> | null = null;
    const result = await fn({
      company: {
        findUnique: async ({ where, select }: { where: { id: number }; select: object }) => {
          assert.deepEqual(where, { id: 41 });
          assert.deepEqual(select, selected);
          return missing ? null : { ...stored };
        },
        update: async ({ where, data, select }: { where: { id: number }; data: Record<string, unknown>; select: object }) => {
          assert.deepEqual(where, { id: 41 });
          assert.deepEqual(select, selected);
          if (deletedDuringUpdate) throw { code: 'P2025' };
          writes.push({ kind: 'update', data });
          pending = { ...stored, ...data } as typeof stored;
          return { ...pending };
        },
      },
      platformAuditEvent: { create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ kind: 'audit', data });
        if (auditFailure) throw new Error('audit failed');
        pendingAudit = data;
      } },
    });
    stored = pending;
    if (pendingAudit) committedAudit.push(pendingAudit);
    return result;
  });
  const principal = mock.fn(async () => ({ id: 7, email: 'staff@example.test', status: 'Activo' }));
  const noTenant = mock.fn(async () => { throw new Error('Tenant lookup must not run'); });
  const noRootWrites = mock.fn(async () => { throw new Error('Writes must use the transaction'); });
  const stubs: [object, string, Function][] = [
    [prisma, '$transaction', transaction], [prisma.platformUser, 'findUnique', principal],
    [prisma.user, 'findUnique', noTenant], [prisma.company, 'update', noRootWrites],
    [prisma.platformAuditEvent, 'create', noRootWrites],
  ];
  for (const [delegate, method, fn] of stubs) Object.defineProperty(delegate, method, { value: fn, configurable: true });
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/platform/companies`;
    const platform = signPlatformToken(7);
    const tenant = signToken({ sub: 7, companyId: 41, email: 'tenant@example.test' });
    const patch = (id: string, body: unknown, token?: string) => fetch(`${base}/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

    assert.equal((await patch('41', { name: 'Updated' })).status, 401);
    assert.equal((await patch('41', { name: 'Updated' }, 'invalid')).status, 401);
    assert.equal((await patch('41', { name: 'Updated' }, tenant)).status, 403);
    assert.equal(principal.mock.callCount(), 0);
    for (const id of ['abc', '0', '2147483648']) assert.equal((await patch(id, { name: 'Updated' }, platform)).status, 400);
    for (const body of [
      {}, { slug: 'new-slug' }, { currency: 'USD' }, { taxId: '123' }, { id: 4 },
      { billing: {} }, { owner: {} }, { roles: [] }, { name: 'New', slug: 'new' },
      { name: ' ' }, { name: 'x'.repeat(121) }, { name: null },
      { legalName: '' }, { legalName: 'x'.repeat(201) },
      { timezone: '' }, { timezone: 'Invalid/Timezone' }, { timezone: 'x'.repeat(51) },
      { timezone: 42 }, [], null,
    ]) assert.equal((await patch('41', body, platform)).status, 400, JSON.stringify(body));
    assert.equal(transaction.mock.callCount(), 0);
    assert.deepEqual(writes, []);

    missing = true;
    assert.equal((await patch('41', { name: 'Updated' }, platform)).status, 404);
    missing = false;
    assert.deepEqual(writes, []);
    assert.equal((await patch('41', { name: '  Company  ', legalName: null }, platform)).status, 200);
    assert.deepEqual(writes, []);
    assert.deepEqual(committedAudit, []);

    const response = await patch('41', { name: '  Updated  ', legalName: ' Updated LLC ', timezone: 'America/Argentina/Buenos_Aires' }, platform);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ...initial, name: 'Updated', legalName: 'Updated LLC', timezone: 'America/Argentina/Buenos_Aires',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    assert.deepEqual(writes, [
      { kind: 'update', data: { name: 'Updated', legalName: 'Updated LLC', timezone: 'America/Argentina/Buenos_Aires' } },
      { kind: 'audit', data: { platformUserId: 7, targetCompanyId: 41, action: 'company.updated' } },
    ]);
    assert.deepEqual(committedAudit, [{ platformUserId: 7, targetCompanyId: 41, action: 'company.updated' }]);
    assert.equal(noTenant.mock.callCount(), 0);
    assert.equal(noRootWrites.mock.callCount(), 0);

    writes.length = 0;
    deletedDuringUpdate = true;
    assert.equal((await patch('41', { name: 'Gone' }, platform)).status, 404);
    deletedDuringUpdate = false;
    assert.deepEqual(writes, []);

    auditFailure = true;
    const consoleError = mock.method(console, 'error', () => {});
    try {
      const failed = await patch('41', { legalName: null }, platform);
      assert.equal(failed.status, 500);
      assert.deepEqual(await failed.json(), { error: 'Error interno del servidor' });
    } finally {
      consoleError.mock.restore();
    }
    assert.deepEqual(writes, [
      { kind: 'update', data: { legalName: null } },
      { kind: 'audit', data: { platformUserId: 7, targetCompanyId: 41, action: 'company.updated' } },
    ]);
    assert.equal(stored.legalName, 'Updated LLC');
    assert.equal(committedAudit.length, 1);
    assert.equal(noRootWrites.mock.callCount(), 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [delegate, method] of stubs) Reflect.deleteProperty(delegate, method);
  }
});
