import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { collectionReference, parseCollectionReference } from '../src/lib/billing.js';

// Fase E: cobro MP real (Checkout Pro preferences) para VENTA de mostrador.
// Se mockea SOLO api.mercadopago.com; el resto pasa al fetch real.
const MP_TEST_TOKEN = 'TEST-mp-collection';
const realFetch = globalThis.fetch;

function mockMp(opts: { preference?: object; paymentDetail?: object; search?: object } = {}) {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(typeof input === 'string' ? input : (input as { url: string }).url);
    if (!url.includes('api.mercadopago.com')) return realFetch(input as never, init);
    if (url.includes('/checkout/preferences')) {
      return Response.json(
        opts.preference ?? { id: 'pref-1', init_point: 'https://mp.test/pay/pref-1' },
      );
    }
    if (url.includes('/v1/payments/search')) {
      return Response.json(opts.search ?? { results: [] });
    }
    const m = /\/v1\/payments\/([^/?]+)/.exec(url);
    if (m) return Response.json(opts.paymentDetail ?? { id: m[1], status: 'pending' });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

let server: Server;
let base: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.MP_ACCESS_TOKEN = MP_TEST_TOKEN;
});

after(async () => {
  restoreFetch();
  delete process.env.MP_ACCESS_TOKEN;
  // Limpieza: eventos, pagos, documentos y stock de los fixtures.
  for (const e of createdEventIds) {
    await prisma.billingEvent.deleteMany({ where: { eventId: e } });
  }
  for (const d of createdDocs) {
    await prisma.payment.deleteMany({ where: { documentId: d.id } });
    await prisma.documentItem.deleteMany({ where: { documentId: d.id } });
    await prisma.document.deleteMany({ where: { id: d.id } });
    await prisma.stock.updateMany({
      where: { productId: d.productId, warehouseId: d.warehouseId },
      data: { quantity: { increment: d.qty } },
    });
  }
  await prisma.client.deleteMany({ where: { name: { startsWith: 'MP Test ' } } });
  server.close();
});

async function api(path: string, options: RequestInit = {}, token?: string) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const createdDocs: { id: number; productId: number; warehouseId: number; qty: number }[] = [];
const createdEventIds: string[] = [];

/** Replica el algoritmo X-Signature de MP con token conocido. */
function mpHeaders(dataId: string) {
  const xRequestId = `req-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const v1 = createHmac('sha256', MP_TEST_TOKEN).update(manifest).digest('hex');
  return { 'x-signature': `ts=${ts};v1=${v1}`, 'x-request-id': xRequestId };
}

async function login(): Promise<{ token: string; companyId: number }> {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(res.status, 200, 'seed login works');
  const rawToken = (res.body as { token: string }).token;
  const me = await api('/api/auth/me', {}, rawToken);
  return {
    token: rawToken,
    companyId: (me.body as { company: { id: number } }).company.id,
  };
}

async function pickStockedProduct(token: string) {
  const products = await api('/api/products', {}, token);
  assert.equal(products.status, 200);
  const product = ((products.body as Record<string, unknown>[]) as {
    id: number;
    stocks: { warehouseId: number; quantity: string | number }[];
  }[]).find((p) => p.stocks?.some((s) => Number(s.quantity) >= 5));
  assert.ok(product, 'a seeded product with stock >= 5 exists');
  const warehouseId = product.stocks.find((s) => Number(s.quantity) >= 5)!.warehouseId;
  return { productId: product.id, warehouseId };
}

/** VENTA abierta (sin pagos) para pedir el intento de cobro. */
async function createOpenSale(token: string, tag: string) {
  const { productId, warehouseId } = await pickStockedProduct(token);
  const res = await api(
    '/api/documents',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'VENTA',
        series: 'A',
        clientName: `MP Test ${tag} ${Date.now()}`,
        warehouseId,
        items: [{ productId, quantity: 1 }],
      }),
    },
    token,
  );
  assert.equal(res.status, 201, `open sale created: ${JSON.stringify(res.body)}`);
  const doc = res.body as { id: number; status: string; total: string | number };
  assert.equal(doc.status, 'Abierto');
  createdDocs.push({ id: doc.id, productId, warehouseId, qty: 1 });
  return doc;
}

test('collectionReference ida y vuelta + inválidos → null', () => {
  assert.equal(collectionReference(3, 42), 'nexus:3:42');
  assert.deepEqual(parseCollectionReference('nexus:3:42'), { companyId: 3, documentId: 42 });
  assert.equal(parseCollectionReference('garbage'), null);
  assert.equal(parseCollectionReference(''), null);
  assert.equal(parseCollectionReference('nexus:abc:1'), null);
});

test('GET /mp-config refleja el token (true) y sin token (false)', async () => {
  const { token } = await login();
  const on = await api('/api/billing/mp-config', {}, token);
  assert.equal(on.status, 200);
  assert.equal((on.body as { configured: boolean }).configured, true);

  delete process.env.MP_ACCESS_TOKEN;
  const off = await api('/api/billing/mp-config', {}, token);
  assert.equal((off.body as { configured: boolean }).configured, false);
  process.env.MP_ACCESS_TOKEN = MP_TEST_TOKEN;
});

test('POST /payments sin token → 503 honesto (no escribe nada)', async () => {
  const { token } = await login();
  const doc = await createOpenSale(token, 'no-token');
  delete process.env.MP_ACCESS_TOKEN;
  try {
    const res = await api(
      '/api/billing/payments',
      { method: 'POST', body: JSON.stringify({ documentId: doc.id }) },
      token,
    );
    assert.equal(res.status, 503, JSON.stringify(res.body));
    const payments = await prisma.payment.findMany({ where: { documentId: doc.id } });
    assert.equal(payments.length, 0, 'no local write without MP');
  } finally {
    process.env.MP_ACCESS_TOKEN = MP_TEST_TOKEN;
  }
});

test('POST /payments con MP mockeado → 201 + fila Pendiente', async () => {
  const { token } = await login();
  const doc = await createOpenSale(token, 'intent');
  mockMp();
  try {
    const res = await api(
      '/api/billing/payments',
      { method: 'POST', body: JSON.stringify({ documentId: doc.id, method: 'QR / Transf.' }) },
      token,
    );
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const body = res.body as { paymentId: number; initPoint: string; status: string };
    assert.ok(body.initPoint.includes('https://mp.test/'), 'init_point del mock');
    assert.equal(body.status, 'pending');
    const row = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    assert.equal(row?.status, 'Pendiente');
    assert.equal(row?.method, 'QR / Transf.');
  } finally {
    restoreFetch();
  }
});

test('GET /payments/:id con search approved → approved y marca Pagado', async () => {
  const { token, companyId } = await login();
  const doc = await createOpenSale(token, 'poll');
  const ref = collectionReference(companyId, doc.id);
  mockMp({
    search: { results: [{ id: 999001, status: 'approved', date_created: '2026-01-02' }] },
  });
  try {
    // El payment Pendiente lo crea el intent (preference mockeada por defecto).
    const created = await api(
      '/api/billing/payments',
      { method: 'POST', body: JSON.stringify({ documentId: doc.id }) },
      token,
    );
    assert.equal(created.status, 201);
    const paymentId = (created.body as { paymentId: number }).paymentId;
    const st = await api(`/api/billing/payments/${paymentId}`, {}, token);
    assert.equal((st.body as { status: string }).status, 'approved', JSON.stringify(st.body));
    const row = await prisma.payment.findUnique({ where: { id: paymentId } });
    assert.equal(row?.status, 'Pagado');
    const updated = await prisma.document.findUnique({
      where: { id: doc.id },
      select: { status: true },
    });
    assert.equal(updated?.status, 'Pagado');
  } finally {
    restoreFetch();
  }
});

test('webhook payment.approved aplica + replay es duplicate; pagado → 409', async () => {
  const { token, companyId } = await login();
  const doc = await createOpenSale(token, 'webhook');
  const ref = collectionReference(companyId, doc.id);
  const dataId = `pay-${Date.now()}`;
  mockMp({ paymentDetail: { id: dataId, status: 'approved', external_reference: ref } });
  try {
    const payload = JSON.stringify({ type: 'payment', data: { id: dataId } });
    // Primera entrega → aplica; replay con el mismo data.id → duplicate.
    const r1 = await api(`/api/billing/webhook?type=payment`, {
      method: 'POST',
      headers: mpHeaders(dataId),
      body: payload,
    });
    assert.equal((r1.body as { action: string }).action, 'collection_approved', JSON.stringify(r1.body));
    createdEventIds.push(dataId);
    const r2 = await api(`/api/billing/webhook?type=payment`, {
      method: 'POST',
      headers: mpHeaders(dataId),
      body: payload,
    });
    assert.equal((r2.body as { action: string }).action, 'duplicate', JSON.stringify(r2.body));
    const updated = await prisma.document.findUnique({
      where: { id: doc.id },
      select: { status: true },
    });
    assert.equal(updated?.status, 'Pagado');

    // Intent sobre documento ya pagado → 409.
    const again = await api(
      '/api/billing/payments',
      { method: 'POST', body: JSON.stringify({ documentId: doc.id }) },
      token,
    );
    assert.equal(again.status, 409, JSON.stringify(again.body));
  } finally {
    restoreFetch();
  }
});
