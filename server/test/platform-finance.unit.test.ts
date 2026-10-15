import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signPlatformToken, signToken } from '../src/lib/jwt.js';

// The ECO overview must surface MRR, the per-plan breakdown and the past-due
// companies so platform staff can read the money without leaving the panel.
test('ECO overview reports MRR, plan breakdown and past-due companies', async () => {
  const sub = (status: string, code: string, name: string, priceMonthly: string, id: number, companyName: string, slug: string | null) =>
    ({ status, plan: { code, name, priceMonthly }, company: { id, name: companyName, slug } });

  const principal = mock.fn(async () => ({ id: 1, status: 'Activo' }));
  const groupBy = mock.fn(async () => [
    { status: 'active', _count: 3 }, { status: 'past_due', _count: 1 }, { status: 'canceled', _count: 1 },
  ]);
  const subscriptions = mock.fn(async () => [
    sub('active', 'free', 'Gratis', '0', 1, 'Alfa', 'alfa'),
    sub('active', 'pro', 'Profesional', '29', 2, 'Beta', 'beta'),
    sub('active', 'pro', 'Profesional', '29', 3, 'Gamma', null),
    sub('past_due', 'pro', 'Profesional', '29', 4, 'Delta', 'delta'),
    sub('canceled', 'enterprise', 'Empresa', '99', 5, 'Epsilon', 'epsilon'),
  ]);
  const events = mock.fn(async () => []);
  const unsubscribed = mock.fn(async () => []);
  const count = mock.fn(async () => 7);
  const stubs: [object, string, Function][] = [
    [prisma.platformUser, 'findUnique', principal],
    [prisma.companySubscription, 'groupBy', groupBy],
    [prisma.companySubscription, 'findMany', subscriptions],
    [prisma.billingEvent, 'findMany', events],
    [prisma.company, 'findMany', unsubscribed],
    [prisma.company, 'count', count],
  ];
  for (const [delegate, method, fn] of stubs) Object.defineProperty(delegate, method, { value: fn, configurable: true });
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/billing/admin/overview`;
    const tenant = signToken({ sub: 1, companyId: 1, email: 'tenant@example.test' });
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: `Bearer ${tenant}` } })).status, 403);

    const response = await fetch(url, { headers: { authorization: `Bearer ${signPlatformToken(1)}` } });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.deepEqual(body.totals, { companies: 7, activeSubscriptions: 3, pastDueSubscriptions: 1, canceledSubscriptions: 1, pendingSubscriptions: 0, mrrUsd: 58 });
    assert.deepEqual(body.planBreakdown, [
      { planCode: 'pro', planName: 'Profesional', priceMonthly: 29, activeCount: 2, mrrUsd: 58 },
      { planCode: 'enterprise', planName: 'Empresa', priceMonthly: 99, activeCount: 0, mrrUsd: 0 },
      { planCode: 'free', planName: 'Gratis', priceMonthly: 0, activeCount: 1, mrrUsd: 0 },
    ]);
    assert.deepEqual(body.pastDueCompanies, [{ id: 4, name: 'Delta', slug: 'delta', planCode: 'pro', planName: 'Profesional' }]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [delegate, method] of stubs) Reflect.deleteProperty(delegate, method);
  }
});
