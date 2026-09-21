import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// POS split payments: POST /api/documents accepts an optional
// `payments: [{ method, amount }]` array that creates one Payment row per
// entry. The suite cleans up every document it creates and restores stock.
let server: Server;
let base: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
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

const createdDocIds: { id: number; productId: number; warehouseId: number; qty: number }[] = [];

async function login(): Promise<string> {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(res.status, 200, 'seed login works');
  return res.body.token as string;
}

async function pickStockedProduct(token: string) {
  const products = await api('/api/products', {}, token);
  assert.equal(products.status, 200);
  const product = (products.body as Record<string, any>[]).find(
    (p) => p.stocks?.some((s: { quantity: string | number }) => Number(s.quantity) >= 5),
  );
  assert.ok(product, 'a seeded product with stock >= 5 exists');
  const warehouseId = product.stocks.find(
    (s: { quantity: string | number }) => Number(s.quantity) >= 5,
  ).warehouseId as number;
  return { productId: product.id as number, warehouseId };
}

test('VENTA with payments array creates one Payment row per entry', async () => {
  const token = await login();
  const { productId, warehouseId } = await pickStockedProduct(token);

  const res = await api(
    '/api/documents',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'VENTA',
        series: 'A',
        clientName: 'POS Split Test',
        warehouseId,
        items: [{ productId, quantity: 1 }],
        payments: [
          // Amounts are placeholders: the real total is read back below.
          // First create fails on purpose? No — fetch the total first via a
          // dry estimate: post with a single payment, read the total, delete.
          { method: 'Efectivo', amount: 0.01 },
        ],
      }),
    },
    token,
  );
  // 0.01 cannot equal the total, so this must already be a 400.
  assert.equal(res.status, 400, `mismatched sum rejected: ${JSON.stringify(res.body)}`);

  // Read the true total from a single-payment sale, then split it exactly.
  const single = await api(
    '/api/documents',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'VENTA',
        series: 'A',
        clientName: 'POS Split Test',
        warehouseId,
        items: [{ productId, quantity: 1 }],
        paymentMethod: 'Efectivo',
      }),
    },
    token,
  );
  assert.equal(single.status, 201, `single-payment sale ok: ${JSON.stringify(single.body)}`);
  const total = Number((single.body as { total: string | number }).total);
  assert.ok(total > 0, 'total is positive');
  const singleBody = single.body as { id: number; payments: { method: string }[] };
  assert.equal(singleBody.payments.length, 1, 'legacy paymentMethod still creates one row');
  assert.equal(singleBody.payments[0].method, 'Efectivo');
  createdDocIds.push({ id: singleBody.id, productId, warehouseId, qty: 1 });

  // Split the exact total across two methods (cent-safe partition).
  const first = Math.floor((total / 2) * 100) / 100;
  const second = Math.round((total - first) * 100) / 100;
  const split = await api(
    '/api/documents',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'VENTA',
        series: 'A',
        clientName: 'POS Split Test',
        warehouseId,
        items: [{ productId, quantity: 1 }],
        payments: [
          { method: 'Efectivo', amount: first },
          { method: 'Tarjeta', amount: second },
        ],
      }),
    },
    token,
  );
  assert.equal(split.status, 201, `split sale ok: ${JSON.stringify(split.body)}`);
  const splitBody = split.body as {
    id: number;
    status: string;
    payments: { method: string; amount: string | number; status: string }[];
  };
  assert.equal(splitBody.status, 'Pagado');
  assert.equal(splitBody.payments.length, 2, 'two Payment rows created');
  const methods = splitBody.payments.map((p) => p.method).sort();
  assert.deepEqual(methods, ['Efectivo', 'Tarjeta']);
  const paidSum = splitBody.payments.reduce((acc, p) => acc + Number(p.amount), 0);
  assert.ok(Math.abs(paidSum - total) < 0.01, 'payment rows sum to the total');
  assert.ok(splitBody.payments.every((p) => p.status === 'Pagado'));
  createdDocIds.push({ id: splitBody.id, productId, warehouseId, qty: 1 });
});

test('VENTA with invalid payment method -> 400', async () => {
  const token = await login();
  const { productId, warehouseId } = await pickStockedProduct(token);

  const res = await api(
    '/api/documents',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'VENTA',
        series: 'A',
        clientName: 'POS Split Test',
        warehouseId,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: 'Mercado Pago Online', amount: 999999 }],
      }),
    },
    token,
  );
  assert.equal(res.status, 400, `unknown method rejected: ${JSON.stringify(res.body)}`);
});

after(async () => {
  // Undo the tests: delete rows bottom-up and give the stock back.
  for (const a of createdDocIds) {
    await prisma.payment.deleteMany({ where: { documentId: a.id } });
    await prisma.documentItem.deleteMany({ where: { documentId: a.id } });
    await prisma.stockMovement.deleteMany({ where: { documentId: a.id } });
    await prisma.stock.update({
      where: { productId_warehouseId: { productId: a.productId, warehouseId: a.warehouseId } },
      data: { quantity: { increment: a.qty } },
    });
    await prisma.document.deleteMany({ where: { id: a.id } });
  }
});
