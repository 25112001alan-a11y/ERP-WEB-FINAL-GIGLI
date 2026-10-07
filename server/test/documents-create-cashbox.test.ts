import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// A cash payment must be tied to the branch's open cash box (Payment.cashBoxId
// was model-only: no creation path ever wrote it). Electronic methods never
// reference a drawer.
let server: Server;
let base: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
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

test('cash payments are tied to the branch open cash box; electronic are not', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(login.status, 200);
  const token = login.body.token as string;

  const products = (await api('/api/products', {}, token)).body as {
    id: number;
    costPrice: number;
    salePrice: number;
  }[];
  const product = products.find((p) => Number(p.costPrice) !== Number(p.salePrice));
  assert.ok(product, 'a seed product with cost != sale exists');
  const clients = (await api('/api/clients', {}, token)).body as { id: number }[];
  assert.ok(clients[0], 'seed client exists');
  const openCashBox = await prisma.cashBox.findFirst({
    where: { status: 'Abierta', branch: { companyId: 14 } },
    select: { id: true, branchId: true },
  });
  assert.ok(openCashBox, 'company 14 has an open cash box');
  const salePoint = await prisma.salePoint.findFirst({
    where: { branchId: openCashBox.branchId },
    select: { number: true },
  });
  assert.ok(salePoint, 'company 14 branch has a sale point');

  const ids: number[] = [];
  try {
    const make = (method: string, payments?: { method: string; amount: number }[]) =>
      api(
        '/api/documents',
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'FACTURA',
            series: 'A',
            branchId: openCashBox.branchId,
            clientId: clients[0].id,
            invoice: { invoiceType: 'A', cae: '70123456789654', puntoVenta: salePoint.number },
            items: [{ productId: product.id, quantity: 1 }],
            ...(payments ? { payments } : { paymentMethod: method }),
          }),
        },
        token,
      );

    const cash = await make('Efectivo');
    assert.equal(cash.status, 201, JSON.stringify(cash.body));
    ids.push(cash.body.id);
    const cashDetail = (await api(`/api/documents/${cash.body.id}`, {}, token)).body as {
      payments: { method: string; cashBoxId: number | null }[];
    };
    assert.ok(cashDetail.payments.length > 0);
    for (const p of cashDetail.payments) {
      assert.equal(p.cashBoxId, openCashBox.id, `cash payment tied to open box (${p.method})`);
    }

    const transfer = await make('QR / Transf.');
    assert.equal(transfer.status, 201, JSON.stringify(transfer.body));
    ids.push(transfer.body.id);
    const transferDetail = (await api(`/api/documents/${transfer.body.id}`, {}, token)).body as {
      payments: { method: string; cashBoxId: number | null }[];
    };
    assert.ok(transferDetail.payments.length > 0);
    for (const p of transferDetail.payments) {
      assert.equal(p.cashBoxId, null, `electronic payment stays untied (${p.method})`);
    }

    const docTotal = Number(cash.body.total);
    const split = await make(undefined, [
      { method: 'Efectivo', amount: docTotal / 2 },
      { method: 'QR / Transf.', amount: docTotal - docTotal / 2 },
    ]);
    assert.equal(split.status, 201, JSON.stringify(split.body));
    ids.push(split.body.id);
    const splitDetail = (await api(`/api/documents/${split.body.id}`, {}, token)).body as {
      payments: { method: string; cashBoxId: number | null }[];
    };
    const byMethod = Object.fromEntries(splitDetail.payments.map((p) => [p.method, p]));
    assert.equal(byMethod['Efectivo']?.cashBoxId, openCashBox.id);
    assert.equal(byMethod['QR / Transf.']?.cashBoxId, null);
  } finally {
    for (const id of ids) {
      await prisma.document.delete({ where: { id } }).catch(() => undefined);
    }
  }
});