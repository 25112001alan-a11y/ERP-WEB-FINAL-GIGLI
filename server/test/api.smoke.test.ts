import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';

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

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

test('GET /api/health -> 200 ok', async () => {
  const { status, body } = await api('/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
});

test('POST /api/auth/login with seed Super Admin -> 200 + token', async () => {
  const { status, body } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(status, 200);
  assert.ok(body.token);
  assert.equal(body.user.email, 'ana.silva@empresa.com');
});

test('POST /api/auth/login with bad credentials -> 401', async () => {
  const { status } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'incorrecta' }),
  });
  assert.equal(status, 401);
});

test('GET /api/users without token -> 401', async () => {
  const { status } = await api('/api/users');
  assert.equal(status, 401);
});

test('GET /api/products with admin token -> 200 with seeded products', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  const { status, body } = await api('/api/products', {
    headers: { authorization: `Bearer ${login.body.token}` },
  });
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 1);
});

test('GET /api/public/store/:slug/products without auth -> 200 with catalog', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(login.status, 200);
  assert.ok(login.body.company.slug, 'login exposes the tenant slug');

  const { status, body } = await api(`/api/public/store/${login.body.company.slug}/products`);
  assert.equal(status, 200);
  assert.ok(body.company);
  assert.equal(body.company.slug, login.body.company.slug);
  assert.ok(Array.isArray(body.products));
  assert.ok(body.products.length >= 1);
  assert.ok('price' in body.products[0]);
  assert.ok('stock' in body.products[0]);
});

test('GET /api/public/store/unknown-slug/products -> 404', async () => {
  const { status } = await api('/api/public/store/no-existe/products');
  assert.equal(status, 404);
});

test('GET /api/public/store/:slug/orders?email=unknown -> 200 empty list', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  const slug = login.body.company.slug;

  const { status, body } = await api(
    `/api/public/store/${slug}/orders?email=nadie@test.local`,
  );
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 0);
});

test('CORS: allowed origin echoes the origin header', async () => {
  const res = await fetch(`${base}/api/health`, {
    headers: { origin: 'http://localhost:3000' },
  });
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
});

test('CORS: disallowed origin gets no access-control header', async () => {
  const res = await fetch(`${base}/api/health`, {
    headers: { origin: 'https://evil.example.com' },
  });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('multi-tenant: a new company gets its own storefront slug and is isolated from the demo tenant', async () => {
  const suffix = Date.now();
  const email = `nueva-${suffix}@test.local`;

  // Onboarding: register creates the company with a slug.
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      companyName: `Tienda Prueba ${suffix}`,
      firstName: 'Test',
      lastName: 'Tenant',
      email,
      password: 'clave-segura-123',
    }),
  });
  assert.equal(reg.status, 201);
  assert.ok(reg.body.company.slug);
  assert.match(reg.body.company.slug, /^tienda-prueba-\d+$/);

  // The new storefront exists but its catalog is empty (no products yet).
  const emptyStore = await api(`/api/public/store/${reg.body.company.slug}/products`);
  assert.equal(emptyStore.status, 200);
  assert.equal(emptyStore.body.products.length, 0);

  // It cannot order a product that belongs to the demo tenant.
  const foreignOrder = await api(`/api/public/store/${reg.body.company.slug}/orders`, {
    method: 'POST',
    body: JSON.stringify({
      clientName: 'Cliente Ajeno',
      clientEmail: email,
      items: [{ productId: 1, quantity: 1 }],
    }),
  });
  assert.notEqual(foreignOrder.status, 201);

  // Tracking is tenant-scoped: an email that exists in the demo tenant yields
  // no orders in the new tenant's storefront.
  const demoOrders = await api(
    `/api/public/store/${reg.body.company.slug}/orders?email=ana.silva@empresa.com`,
  );
  assert.equal(demoOrders.status, 200);
  assert.equal(demoOrders.body.length, 0);
});