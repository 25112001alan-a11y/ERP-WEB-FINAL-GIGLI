import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signPlatformToken, signToken } from '../src/lib/jwt.js';

test('ECO provisions a pending owner and one-time invitation inside one transaction', async () => {
  const writes: { delegate: string; data: Record<string, unknown> }[] = [];
  const record = (delegate: string, data: Record<string, unknown>) => { writes.push({ delegate, data }); };
  const company = { id: 41, name: 'Nueva Empresa', slug: 'nueva-empresa', currency: 'ARS' };
  const owner = { id: 52, firstName: 'Nuevo', lastName: 'Dueño', email: 'owner@example.test', status: 'Pendiente' };
  const tx = {
    company: {
      findUnique: mock.fn(async () => null),
      create: mock.fn(async ({ data, select }: { data: Record<string, unknown>; select: Record<string, boolean> }) => {
        record('company', data);
        assert.deepEqual(select, { id: true, name: true, slug: true, currency: true });
        return company;
      }),
    },
    permission: {
      createMany: mock.fn(async ({ data, skipDuplicates }: { data: { name: string }[]; skipDuplicates: boolean }) => {
        record('permission', { data, skipDuplicates });
      }),
      findMany: mock.fn(async ({ where }: { where: { name: { in: string[] } } }) => {
        assert.ok(!where.name.in.includes('billing.manage'));
        return where.name.in.map((name, id) => ({ id: id + 1, name }));
      }),
    },
    role: { create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => {
      record('role', data);
      return { id: 73 };
    }) },
    user: { create: mock.fn(async ({ data, select }: { data: Record<string, unknown>; select: Record<string, boolean> }) => {
      record('user', data);
      assert.deepEqual(select, { id: true, firstName: true, lastName: true, email: true, status: true });
      return owner;
    }) },
    ownerInvitation: { create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => { record('invitation', data); }) },
    platformAuditEvent: { create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => { record('audit', data); }) },
  };
  let failure: unknown;
  const transaction = mock.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
    const result = await fn(tx);
    if (failure) throw failure;
    return result;
  });
  const principal = mock.fn(async () => ({ id: 7, email: 'staff@example.test', status: 'Activo' }));
  const list = mock.fn(async () => [company]);
  const detail = mock.fn(async () => company);
  const stubs: [object, string, Function][] = [
    [prisma, '$transaction', transaction], [prisma.platformUser, 'findUnique', principal],
    [prisma.company, 'findMany', list], [prisma.company, 'findUnique', detail],
    [prisma.company, 'count', mock.fn(async () => 1)],
  ];
  for (const [delegate, method, fn] of stubs) Object.defineProperty(delegate, method, { value: fn, configurable: true });
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/platform/companies`;
    const platform = signPlatformToken(7);
    const post = (body: object, token?: string) => fetch(base, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = { companyName: company.name, firstName: owner.firstName, lastName: owner.lastName, email: owner.email };
    assert.equal((await post(data)).status, 401);
    assert.equal((await post(data, 'invalid')).status, 401);
    assert.equal((await post(data, signToken({ sub: 7, companyId: 2, email: 'tenant@example.test' }))).status, 403);
    assert.equal(principal.mock.callCount(), 0);
    assert.equal(transaction.mock.callCount(), 0);

    for (const invalid of [
      { ...data, password: 'chosen-secret' }, { ...data, companyName: 'a' },
      { ...data, firstName: 'a' }, { ...data, lastName: 'a' },
      { ...data, email: `${'a'.repeat(145)}@test.com` }, { ...data, currency: 'DOLLAR' },
    ]) {
      const response = await post(invalid, platform);
      assert.equal(response.status, 400);
      assert.ok(!(await response.text()).includes('chosen-secret'));
    }
    assert.equal(transaction.mock.callCount(), 0);

    const response = await post(data, platform);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.deepEqual(Object.keys(result).sort(), ['company', 'invitationToken', 'owner']);
    assert.deepEqual(result.company, company);
    assert.deepEqual(result.owner, owner);
    assert.match(result.invitationToken, /^[a-f0-9]{64}$/);
    assert.equal(transaction.mock.callCount(), 1);
    assert.deepEqual(writes.map(({ delegate }) => delegate), ['company', 'permission', 'role', 'user', 'invitation', 'audit']);
    assert.equal(writes[0].data.slug, company.slug);
    assert.equal(writes[1].data.skipDuplicates, true);
    assert.equal(writes[2].data.companyId, company.id);
    assert.equal(writes[2].data.name, 'Super Admin');
    assert.equal((writes[2].data.permissions as { create: unknown[] }).create.length, (writes[1].data.data as unknown[]).length);
    assert.equal(writes[3].data.companyId, company.id);
    assert.equal(writes[3].data.status, 'Pendiente');
    assert.deepEqual(writes[3].data.roles, { create: [{ roleId: 73 }] });
    assert.match(writes[3].data.passwordHash as string, /^\$2[aby]\$/);
    assert.equal(await bcrypt.compare(result.invitationToken, writes[3].data.passwordHash as string), false);
    assert.deepEqual({ ...writes[4].data, tokenHash: undefined, expiresAt: undefined }, {
      companyId: company.id, userId: owner.id, platformUserId: 7, tokenHash: undefined, expiresAt: undefined,
    });
    assert.equal(writes[4].data.tokenHash, createHash('sha256').update(result.invitationToken).digest('hex'));
    assert.ok(Math.abs(new Date(writes[4].data.expiresAt as string).getTime() - (Date.now() + 86_400_000)) < 10_000);
    assert.deepEqual(writes[5].data, { platformUserId: 7, targetCompanyId: company.id, action: 'company.created' });
    assert.ok(!JSON.stringify(writes).includes(result.invitationToken));

    const get = (path: string) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${platform}` } });
    assert.equal((await get('')).status, 200);
    assert.equal((await get('/41')).status, 200);
    assert.ok(!JSON.stringify(await (await get('')).json()).includes(result.invitationToken));
    assert.ok(!JSON.stringify(await (await get('/41')).json()).includes(result.invitationToken));

    failure = { code: 'P2002', meta: { target: 'tokenHash', secret: result.invitationToken } };
    const conflict = await post(data, platform);
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { error: 'El registro ya existe' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [delegate, method] of stubs) Reflect.deleteProperty(delegate, method);
  }
});
