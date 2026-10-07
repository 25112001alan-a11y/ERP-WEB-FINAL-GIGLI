import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Purchase-side documents (OC) must default missing unitPrice to the catalog
// cost, not the sale price. A real OC valued at retail inflates purchase
// records and the supplier-invoice chain.
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

test('OC without unitPrice is valued at cost, not sale price', async () => {
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
  const suppliers = (await api('/api/suppliers', {}, token)).body as { id: number }[];
  assert.ok(suppliers[0], 'seed supplier exists');

  let ocId: number | undefined;
  try {
    const oc = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'OC',
          series: 'A',
          supplierId: suppliers[0].id,
          items: [{ productId: product.id, quantity: 1 }],
        }),
      },
      token,
    );
    assert.equal(oc.status, 201, JSON.stringify(oc.body));
    ocId = Number(oc.body.id);

    const detail = (await api(`/api/documents/${ocId}`, {}, token)).body as {
      items: { unitPrice: number }[];
    };
    assert.equal(Number(detail.items[0]?.unitPrice), Number(product.costPrice));
    assert.notEqual(Number(product.costPrice), Number(product.salePrice));
  } finally {
    if (ocId) {
      await prisma.document.delete({ where: { id: ocId } }).catch(() => undefined);
    }
  }
});