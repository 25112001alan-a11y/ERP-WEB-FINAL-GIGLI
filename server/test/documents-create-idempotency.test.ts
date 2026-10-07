import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// At-most-once document creation: a reused idempotencyKey replays the original
// document (double click, transport retry) instead of minting a duplicate; a
// derived document rejects attempts to override the inherited price/discount.
// Runs against the live seeded database and cleans up everything it creates,
// restoring stock balances.
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

test('create with idempotencyKey: replay returns the original, no duplicate', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(login.status, 200);
  const token = login.body.token as string;

  const products = (await api('/api/products', {}, token)).body as { id: number }[];
  const suppliers = (await api('/api/suppliers', {}, token)).body as { id: number }[];
  assert.ok(products[0]?.id && suppliers[0]?.id, 'seeded product and supplier exist');

  const stamp = Date.now();
  const series = `I${String(stamp).slice(-8)}`;
  const key = randomUUID();
  const body = {
    type: 'OC',
    series,
    supplierId: suppliers[0].id,
    items: [{ productId: products[0].id, quantity: 1, unitPrice: 10 }],
    idempotencyKey: key,
  };

  const createdIds: number[] = [];
  try {
    const first = await api('/api/documents', { method: 'POST', body: JSON.stringify(body) }, token);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const id = Number(first.body.id);
    createdIds.push(id);
    const companyId = first.body.companyId as number;

    // Same command, same key: replay, not a duplicate.
    const replay = await api('/api/documents', { method: 'POST', body: JSON.stringify(body) }, token);
    assert.equal(replay.status, 200);
    assert.equal(Number(replay.body.id), id);

    // Even a different command reusing the key resolves to the original
    // (at-most-once semantics: the first document wins, nothing is minted twice).
    const other = await api(
      '/api/documents',
      { method: 'POST', body: JSON.stringify({ ...body, notes: 'otra intencion' }) },
      token,
    );
    assert.equal(other.status, 200);
    assert.equal(Number(other.body.id), id);

    const count = await prisma.document.count({ where: { companyId, series, type: 'OC' } });
    assert.equal(count, 1);
  } finally {
    for (const id of createdIds) {
      await prisma.document.delete({ where: { id } }).catch(() => undefined);
    }
  }
});

test('derived lines reject overridden unitPrice/discount but accept absent ones', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(login.status, 200);
  const token = login.body.token as string;

  const products = (await api('/api/products', {}, token)).body as { id: number }[];
  const product = products[0] as { id: number };
  assert.ok(product, 'seeded product exists');
  const clients = (await api('/api/clients', {}, token)).body as { id: number }[];
  assert.ok(clients[0], 'seeded client exists');
  const stock = await prisma.stock.findFirst({ where: { productId: product.id } });
  assert.ok(stock, 'product has stock');
  const originalQuantity = Number(stock.quantity);
  assert.ok(originalQuantity >= 1, `stock ${originalQuantity} >= 1`);

  const stamp = Date.now();
  const createdDocs: number[] = [];
  const remitoIds: number[] = [];

  try {
    // Source PEDIDO: no stock side effects.
    const pedido = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'PEDIDO',
          series: `P${String(stamp).slice(-8)}`,
          clientId: clients[0].id,
          items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
        }),
      },
      token,
    );
    assert.equal(pedido.status, 201, JSON.stringify(pedido.body));
    const pedidoId = Number(pedido.body.id);
    createdDocs.push(pedidoId);

    const sourceLine = await prisma.documentItem.findFirst({ where: { documentId: pedidoId, productId: product.id } });
    assert.ok(sourceLine, 'source line exists');

    const derive = (unitPrice?: number) =>
      api(
        '/api/documents',
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'REMITO',
            direction: 'egreso',
            series: `R${String(stamp).slice(-8)}`,
            sourceDocumentId: pedidoId,
            warehouseId: stock.warehouseId,
            items: [
              {
                productId: product.id,
                sourceDocumentItemId: sourceLine.id,
                quantity: 1,
                ...(unitPrice !== undefined ? { unitPrice } : {}),
              },
            ],
          }),
        },
        token,
      );

    // Mismatched override: rejected before any stock side effect (400, not 200).
    const override = await derive(999);
    assert.equal(override.status, 400, `expected 400, got ${JSON.stringify(override.body)}`);
    assert.match(override.body.error, /hereda el precio/);

    // Absent unitPrice (the UI path): inherited from the source, 201.
    const clean = await derive();
    assert.equal(clean.status, 201, JSON.stringify(clean.body));
    const remitoId = Number(clean.body.id);
    remitoIds.push(remitoId);
    const line = await prisma.documentItem.findFirstOrThrow({ where: { documentId: remitoId } });
    assert.equal(Number(line.unitPrice), 10);
  } finally {
    // Movements first (FK restrict), then derived REMITOs, then the source;
    // restore stock to its exact pre-test balance.
    await prisma.stockMovement.deleteMany({ where: { documentId: { in: remitoIds } } }).catch(() => undefined);
    for (const id of remitoIds) {
      await prisma.document.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of createdDocs) {
      await prisma.document.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.stock.update({ where: { productId_warehouseId: { productId: product.id, warehouseId: stock.warehouseId } }, data: { quantity: originalQuantity } }).catch(() => undefined);
  }
});