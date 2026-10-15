import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signPlatformToken, signToken } from '../src/lib/jwt.js';

// A platform admin can override a tenant's SaaS plan, status and cancel-at-period-end
// from /eco. Only committed changes are written and audited.
test('ECO subscription override updates plan/status and audits committed changes', async () => {
  let stored: { planId: number; status: string; cancelAtPeriodEnd: boolean } | null = {
    planId: 1, status: 'active', cancelAtPeriodEnd: false,
  };
  const audits: Record<string, unknown>[] = [];
  const writes: { kind: string; data: Record<string, unknown> }[] = [];
  const plans: Record<string, { id: number }> = { free: { id: 1 }, pro: { id: 2 }, enterprise: { id: 3 } };

  const summary = (status: string, cancelAtPeriodEnd: boolean, code: string, name: string, priceMonthly: number) =>
    ({ status, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd, plan: { code, name, priceMonthly } });

  const transaction = mock.fn(async (fn: (tx: object) => Promise<unknown>) => fn({
    companySubscription: {
      findUnique: async ({ select }: { select: Record<string, unknown> }) => (
        'planId' in select ? stored : (stored ? summary(stored.status, stored.cancelAtPeriodEnd, 'free', 'Gratis', 0) : null)
      ),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ kind: 'create', data });
        stored = { planId: data.planId as number, status: data.status as string, cancelAtPeriodEnd: data.cancelAtPeriodEnd as boolean };
        return summary(stored.status, stored.cancelAtPeriodEnd, 'enterprise', 'Empresa', 99);
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ kind: 'update', data });
        stored = { ...stored!, ...(data as object) } as typeof stored;
        return summary(stored!.status, stored!.cancelAtPeriodEnd, 'pro', 'Profesional', 29);
      },
    },
    plan: { findUnique: async ({ where }: { where: { code: string } }) => plans[where.code] ?? null },
    platformAuditEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); } },
  }));

  const principal = mock.fn(async () => ({ id: 7, email: 'staff@example.test', status: 'Activo' }));
  const planFind = mock.fn(async ({ where }: { where: { code: string } }) => plans[where.code] ?? null);
  const companyFind = mock.fn(async ({ where }: { where: { id: number } }) => (where.id === 41 ? { id: 41 } : null));
  const stubs: [object, string, Function][] = [
    [prisma, '$transaction', transaction], [prisma.platformUser, 'findUnique', principal],
    [prisma.plan, 'findUnique', planFind], [prisma.company, 'findUnique', companyFind],
  ];
  for (const [delegate, method, fn] of stubs) Object.defineProperty(delegate, method, { value: fn, configurable: true });
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const platform = signPlatformToken(7);
    const tenant = signToken({ sub: 7, companyId: 41, email: 'tenant@example.test' });
    const patch = (body: unknown, token?: string, id = '41') => fetch(`${origin}/api/platform/companies/${id}/subscription`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

    assert.equal((await patch({ status: 'active' })).status, 401);
    assert.equal((await patch({ status: 'active' }, tenant)).status, 403);
    for (const id of ['abc', '0', '2147483648']) assert.equal((await patch({ status: 'active' }, platform, id)).status, 400);
    for (const body of [{}, { status: 'weird' }, { planCode: '' }, { nope: 1 }, [], null]) {
      assert.equal((await patch(body, platform)).status, 400, JSON.stringify(body));
    }
    assert.equal(transaction.mock.callCount(), 0);

    assert.equal((await patch({ planCode: 'ghost' }, platform)).status, 400);
    assert.equal((await patch({ planCode: 'pro' }, platform, '999')).status, 404);
    assert.deepEqual(writes, []);

    assert.equal((await patch({ planCode: 'free', status: 'active', cancelAtPeriodEnd: false }, platform)).status, 200);
    assert.deepEqual(writes, []);
    assert.deepEqual(audits, []);

    const changed = await patch({ planCode: 'pro', status: 'past_due', cancelAtPeriodEnd: true }, platform);
    assert.equal(changed.status, 200);
    assert.deepEqual(await changed.json(), summary('past_due', true, 'pro', 'Profesional', 29));
    assert.deepEqual(writes, [{ kind: 'update', data: { planId: 2, status: 'past_due', cancelAtPeriodEnd: true } }]);
    assert.deepEqual(audits, [{ platformUserId: 7, targetCompanyId: 41, action: 'subscription.updated' }]);

    stored = null;
    writes.length = 0;
    audits.length = 0;
    const created = await patch({ planCode: 'enterprise' }, platform);
    assert.equal(created.status, 200);
    assert.equal(writes[0].kind, 'create');
    assert.equal(writes[0].data.planId, 3);
    assert.deepEqual(audits, [{ platformUserId: 7, targetCompanyId: 41, action: 'subscription.created' }]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [delegate, method] of stubs) Reflect.deleteProperty(delegate, method);
  }
});
