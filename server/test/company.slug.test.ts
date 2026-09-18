import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';

let server: Server;
let base: string;
const ORIGINAL_SLUG = 'nexus-enterprise-corp';

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  // Hygiene: restore the demo tenant's slug so other suites keep working.
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  if (login.status === 200) {
    await api('/api/company', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${login.body.token}` },
      body: JSON.stringify({ slug: ORIGINAL_SLUG }),
    });
  }
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

test('GET /api/company exposes the storefront slug', async () => {
  const auth = await loginDemo();
  const { status, body } = await api('/api/company', { headers: { authorization: auth } });
  assert.equal(status, 200);
  assert.equal(body.slug, ORIGINAL_SLUG);
});

test('PATCH /api/company updates the slug and the storefront follows', async () => {
  const auth = await loginDemo();
  const nextSlug = `tienda-demo-${Date.now()}`;
  const patch = await api('/api/company', {
    method: 'PATCH',
    headers: { authorization: auth },
    body: JSON.stringify({ slug: `  ${nextSlug.toUpperCase()}  ` }),
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.slug, nextSlug);

  const store = await api(`/api/public/store/${nextSlug}/products`);
  assert.equal(store.status, 200);
  assert.ok(store.body.company.slug === nextSlug);

  const oldStore = await api(`/api/public/store/${ORIGINAL_SLUG}/products`);
  assert.equal(oldStore.status, 404);
});

test('PATCH /api/company rejects a slug owned by another tenant -> 409', async () => {
  const suffix = Date.now();
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      companyName: `Slug Owner ${suffix}`,
      firstName: 'Due',
      lastName: 'ño',
      email: `owner-${suffix}@test.local`,
      password: 'clave-segura-123',
    }),
  });
  assert.equal(reg.status, 201);
  const otherSlug = reg.body.company.slug;
  assert.ok(otherSlug);

  const auth = await loginDemo();
  const patch = await api('/api/company', {
    method: 'PATCH',
    headers: { authorization: auth },
    body: JSON.stringify({ slug: otherSlug }),
  });
  assert.equal(patch.status, 409);
  assert.ok(patch.body.error);
});