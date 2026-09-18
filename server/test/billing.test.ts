import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Free-plan caps are exercised with a tiny limit here. This file runs in its
// own process, so the values set by setup.ts are overridden just for it.
process.env.BILLING_FREE_DOC_LIMIT = '3';
process.env.BILLING_FREE_PRODUCT_LIMIT = '3';

let server: Server;
let base: string;
const MP_TEST_TOKEN = 'TEST-secreto-local';

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.MP_ACCESS_TOKEN = MP_TEST_TOKEN;
});

after(() => {
  delete process.env.MP_ACCESS_TOKEN;
  server.close();
});

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function loginDemo() {
  const { body } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  return `Bearer ${body.token}`;
}

/** Replicates the Mercado Pago X-Signature algorithm with a known token. */
function mpSignature(dataId: string, xRequestId: string) {
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const v1 = createHmac('sha256', MP_TEST_TOKEN).update(manifest).digest('hex');
  return { ts, v1, xRequestId };
}

// ---------------------------------------------------------------------------
// Catalog & subscription
// ---------------------------------------------------------------------------

test('GET /api/billing/plans -> 200 with the SaaS catalog', async () => {
  const { status, body } = await api('/api/billing/plans');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 3);
  const free = body.find((p: { code: string }) => p.code === 'free');
  assert.ok(free);
  assert.equal(Number(free.priceMonthly), 0);
  const pro = body.find((p: { code: string }) => p.code === 'pro');
  assert.ok(pro);
  assert.equal(Number(pro.priceMonthly), 29);
});

test('GET /api/billing/subscription -> plan info for the authenticated tenant', async () => {
  const auth = await loginDemo();
  const { status, body } = await api('/api/billing/subscription', {
    headers: { authorization: auth },
  });
  assert.equal(status, 200);
  assert.ok(body.plan);
  assert.ok(typeof body.plan.code === 'string');
});

test('POST /api/billing/checkout -> 503 when Mercado Pago is not configured', async () => {
  const auth = await loginDemo();
  delete process.env.MP_ACCESS_TOKEN;
  try {
    const { status } = await api('/api/billing/checkout', {
      method: 'POST',
      headers: { authorization: auth },
      body: JSON.stringify({ planCode: 'pro' }),
    });
    assert.equal(status, 503);
  } finally {
    process.env.MP_ACCESS_TOKEN = MP_TEST_TOKEN;
  }
});

// ---------------------------------------------------------------------------
// Webhook: signature verification + idempotency
// ---------------------------------------------------------------------------

test('POST /api/billing/webhook rejects an unsigned event -> 401', async () => {
  const { status } = await api('/api/billing/webhook?type=subscription_updated', {
    method: 'POST',
    body: JSON.stringify({ data: { id: 'mp-unknown' } }),
  });
  assert.equal(status, 401);
});

test('POST /api/billing/webhook rejects a tampered signature -> 401', async () => {
  const { ts, xRequestId } = mpSignature('mp-unknown', 'req-x');
  const { status } = await api('/api/billing/webhook?type=subscription_updated', {
    method: 'POST',
    headers: { 'x-signature': `ts=${ts};v1=deadbeef`, 'x-request-id': xRequestId },
    body: JSON.stringify({ data: { id: 'mp-unknown' } }),
  });
  assert.equal(status, 401);
});

test('POST /api/billing/webhook applies a verified subscription event and is idempotent', async () => {
  const suffix = Date.now();
  const email = `billing-${suffix}@test.local`;
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      companyName: `Billing Test ${suffix}`,
      firstName: 'Bil',
      lastName: 'Sub',
      email,
      password: 'clave-segura-123',
    }),
  });
  assert.equal(reg.status, 201);
  const companyId = reg.body.company.id;

  // Attach a Mercado Pago subscription id directly (the checkout flow needs
  // real MP credentials; the webhook path is what we exercise here).
  const freePlan = await prisma.plan.findUnique({ where: { code: 'free' } });
  assert.ok(freePlan);
  const mpSubId = `mp-test-${suffix}`;
  await prisma.companySubscription.upsert({
    where: { companyId },
    create: { companyId, planId: freePlan.id, status: 'active', mpSubscriptionId: mpSubId },
    update: { mpSubscriptionId: mpSubId, status: 'active' },
  });

  // Verified event: cancel the subscription.
  const xRequestId = `req-${suffix}`;
  const { ts, v1 } = mpSignature(mpSubId, xRequestId);
  const payload = { data: { id: mpSubId, status: 'cancelled' } };
  const first = await api('/api/billing/webhook?type=subscription_updated', {
    method: 'POST',
    headers: { 'x-signature': `ts=${ts};v1=${v1}`, 'x-request-id': xRequestId },
    body: JSON.stringify(payload),
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.action, 'subscription_canceled');

  const local = await prisma.companySubscription.findUnique({ where: { companyId } });
  assert.equal(local?.status, 'canceled');

  // Replay of the same event (same id) must not apply twice.
  const replay = await api('/api/billing/webhook?type=subscription_updated', {
    method: 'POST',
    headers: { 'x-signature': `ts=${ts};v1=${v1}`, 'x-request-id': xRequestId },
    body: JSON.stringify(payload),
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.action, 'duplicate');

  const events = await prisma.billingEvent.count({ where: { eventId: mpSubId } });
  assert.equal(events, 1);
});

// ---------------------------------------------------------------------------
// Free-plan limits (402)
// ---------------------------------------------------------------------------

test('Free plan: document cap returns 402 for the demo tenant', async () => {
  const auth = await loginDemo();
  const products = await api('/api/products', { headers: { authorization: auth } });
  assert.ok(products.body.length >= 3, 'Demo tenant seeded products expected');

  const { status, body } = await api('/api/documents', {
    method: 'POST',
    headers: { authorization: auth },
    body: JSON.stringify({
      type: 'OC',
      series: 'A',
      supplierName: 'Proveedor Límite',
      items: [{ productId: products.body[0].id, quantity: 1 }],
    }),
  });
  assert.equal(status, 402);
  assert.ok(body.error);
  assert.ok(body.plan);
  assert.equal(body.plan.code, 'free');
});

test('Free plan: product cap allows up to 3 then returns 402', async () => {
  const suffix = Date.now();
  const email = `limit-${suffix}@test.local`;
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      companyName: `Limit Test ${suffix}`,
      firstName: 'Lim',
      lastName: 'Free',
      email,
      password: 'clave-segura-123',
    }),
  });
  assert.equal(reg.status, 201);
  const auth = `Bearer ${reg.body.token}`;

  // Tenant-owned tax for the new company.
  const tax = await api('/api/products/taxes', {
    method: 'POST',
    headers: { authorization: auth },
    body: JSON.stringify({ name: 'IVA Test 21', rate: 21 }),
  });
  assert.equal(tax.status, 201);

  const createProduct = () =>
    api('/api/products', {
      method: 'POST',
      headers: { authorization: auth },
      body: JSON.stringify({
        name: 'Producto Límite',
        salePrice: 10,
        costPrice: 5,
        taxId: tax.body.id,
        active: true,
      }),
    });

  for (let i = 0; i < 3; i += 1) {
    const { status } = await createProduct();
    assert.equal(status, 201, `product #${i + 1} should be allowed`);
  }

  const fourth = await createProduct();
  assert.equal(fourth.status, 402);
  assert.equal(fourth.body.plan.code, 'free');
});