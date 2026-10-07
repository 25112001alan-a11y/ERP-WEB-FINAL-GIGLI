import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Creation-frontier validations: no counterpart mixing, no derivation outside
// the directional documents, and a validated series (trimmed, [A-Za-z0-9-_],
// max 10). All rejections happen before any transaction side effect.
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

test('create frontier: no client+supplier mix, no non-directional derivation, validated series', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(login.status, 200);
  const token = login.body.token as string;

  const products = (await api('/api/products', {}, token)).body as { id: number }[];
  const suppliers = (await api('/api/suppliers', {}, token)).body as { id: number }[];
  const clients = (await api('/api/clients', {}, token)).body as { id: number }[];
  assert.ok(products[0] && suppliers[0] && clients[0], 'seed data exists');

  const createdIds: number[] = [];
  try {
    // Mixing counterparties is rejected for every type (was directional-only).
    const mixed = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'OC',
          series: 'A',
          supplierId: suppliers[0].id,
          clientId: clients[0].id,
          items: [{ productId: products[0].id, quantity: 1 }],
        }),
      },
      token,
    );
    assert.equal(mixed.status, 400);
    assert.match(mixed.body.error ?? '', /mezclar cliente y proveedor/);

    // Derivation only for directional documents: COTIZACION rejected.
    const oc = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'OC',
          series: 'A',
          supplierId: suppliers[0].id,
          items: [{ productId: products[0].id, quantity: 1 }],
        }),
      },
      token,
    );
    assert.equal(oc.status, 201, JSON.stringify(oc.body));
    const ocId = Number(oc.body.id);
    createdIds.push(ocId);

    const quote = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'COTIZACION',
          series: 'A',
          sourceDocumentId: ocId,
          clientId: clients[0].id,
          items: [{ productId: products[0].id, quantity: 1 }],
        }),
      },
      token,
    );
    assert.equal(quote.status, 400);
    assert.match(quote.body.error ?? '', /derivados de otro comprobante/);

    // sourceDocumentItemId on a non-derived line is rejected too (it would
    // be silently ignored in the line loop).
    const line = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'VENTA',
          series: 'A',
          clientId: clients[0].id,
          items: [{ productId: products[0].id, quantity: 1, sourceDocumentItemId: 1 }],
        }),
      },
      token,
    );
    assert.equal(line.status, 400);
    assert.match(line.body.error ?? '', /líneas de origen/);

    // Series must survive trim and the charset rule; whitespace inside or
    // non-ASCII characters are invalid.
    const spaced = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'OC',
          series: 'C 1',
          supplierId: suppliers[0].id,
          items: [{ productId: products[0].id, quantity: 1 }],
        }),
      },
      token,
    );
    assert.equal(spaced.status, 400, JSON.stringify(spaced.body));

    const accent = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'OC',
          series: 'É',
          supplierId: suppliers[0].id,
          items: [{ productId: products[0].id, quantity: 1 }],
        }),
      },
      token,
    );
    assert.equal(accent.status, 400);

    const trimmed = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'OC',
          series: ' B ',
          supplierId: suppliers[0].id,
          items: [{ productId: products[0].id, quantity: 1 }],
        }),
      },
      token,
    );
    assert.equal(trimmed.status, 201, JSON.stringify(trimmed.body));
    assert.equal(trimmed.body.series, 'B');
    createdIds.push(Number(trimmed.body.id));
  } finally {
    for (const id of createdIds) {
      await prisma.document.delete({ where: { id } }).catch(() => undefined);
    }
  }
});