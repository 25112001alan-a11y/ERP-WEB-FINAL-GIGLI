import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Public checkout must treat a storefront shopper as a retail person, not a
// wholesale client, and must never invent a line discount (Product has no
// catalog discount).
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

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

test('public checkout creates a Persona client and lines without invented discount', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(login.status, 200);
  const slug = login.body.company.slug as string;

  const catalog = await api(`/api/public/store/${slug}/products`);
  assert.equal(catalog.status, 200);
  const product = catalog.body.products[0];
  assert.ok(product, 'storefront catalog has a product');

  const shopper = `Comprador Publico ${Date.now()}`;
  let orderId: number | undefined;
  let clientId: number | undefined;
  try {
    const order = await api(`/api/public/store/${slug}/orders`, {
      method: 'POST',
      body: JSON.stringify({
        clientName: shopper,
        items: [{ productId: product.id, quantity: 2 }],
      }),
    });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    orderId = Number(order.body.id);

    const client = await prisma.client.findFirst({
      where: { companyId: 14, name: shopper },
      select: { id: true, type: true },
    });
    assert.ok(client, 'public order created the client');
    clientId = client.id;
    assert.equal(client.type, 'Persona');

    const lines = await prisma.documentItem.findMany({
      where: { documentId: orderId },
      select: { discount: true, unitPrice: true, quantity: true },
    });
    assert.ok(lines.length > 0);
    for (const line of lines) {
      assert.equal(Number(line.discount), 0);
      assert.equal(Number(line.unitPrice), Number(product.price));
    }
  } finally {
    if (orderId) {
      await prisma.document.delete({ where: { id: orderId } }).catch(() => undefined);
    }
    if (clientId) {
      await prisma.client.delete({ where: { id: clientId } }).catch(() => undefined);
    }
  }
});