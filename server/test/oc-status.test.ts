import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DocumentType } from '@prisma/client';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// End-to-end OC cancellation: Abierto -> Anulado before any receipt; terminal
// afterwards; an OC with derived documents cannot be cancelled. Runs against
// the live seeded database and deletes every document it creates.
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

test('oc cancel: Abierto -> Anulado, terminal, no En Proceso step, derived docs block', async () => {
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
  const series = `A${String(stamp).slice(-8)}`;
  const item = { productId: products[0].id, quantity: 1, unitPrice: 10 };

  const createdIds: number[] = [];
  const cleanup = async () => {
    for (const id of createdIds) {
      await prisma.document.delete({ where: { id } }).catch(() => undefined);
    }
  };

  try {
    // 1) An Abierto OC can be cancelled before any receipt exists.
    const oc = await api(
      '/api/documents',
      { method: 'POST', body: JSON.stringify({ type: 'OC', series, supplierId: suppliers[0].id, items: [item] }) },
      token,
    );
    assert.equal(oc.status, 201, JSON.stringify(oc.body));
    assert.equal(oc.body.status, 'Abierto');
    const ocId = Number(oc.body.id);
    createdIds.push(ocId);

    const cancelled = await api(
      `/api/documents/${ocId}/status`,
      { method: 'PATCH', body: JSON.stringify({ status: 'Anulado' }) },
      token,
    );
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.status, 'Anulado');

    // 2) Anulado is terminal.
    const again = await api(
      `/api/documents/${ocId}/status`,
      { method: 'PATCH', body: JSON.stringify({ status: 'Anulado' }) },
      token,
    );
    assert.equal(again.status, 400);

    // 3) OC has no En Proceso step (sales-only transition).
    const oc2 = await api(
      '/api/documents',
      { method: 'POST', body: JSON.stringify({ type: 'OC', series: `B${String(stamp).slice(-8)}`, supplierId: suppliers[0].id, items: [item] }) },
      token,
    );
    assert.equal(oc2.status, 201, JSON.stringify(oc2.body));
    const oc2Id = Number(oc2.body.id);
    createdIds.push(oc2Id);
    const toProcess = await api(
      `/api/documents/${oc2Id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status: 'En Proceso' }) },
      token,
    );
    assert.equal(toProcess.status, 400);

    // 4) An OC with any derived document cannot be cancelled (409). The child
    // is inserted directly so the suite keeps no stock side effects.
    const parent = await prisma.document.findFirst({ where: { id: oc2Id }, select: { companyId: true, userId: true } });
    assert.ok(parent);
    const child = await prisma.document.create({
      data: {
        companyId: parent.companyId,
        type: DocumentType.REMITO,
        series: `C${String(stamp).slice(-8)}`,
        number: 1,
        userId: parent.userId,
        sourceDocumentId: oc2Id,
        subtotal: 0,
        totalTax: 0,
        total: 0,
      },
    });
    createdIds.push(child.id);
    const blocked = await api(
      `/api/documents/${oc2Id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status: 'Anulado' }) },
      token,
    );
    assert.equal(blocked.status, 409);
  } finally {
    await cleanup();
  }
});