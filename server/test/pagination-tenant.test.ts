import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';

// DB-level pagination: pass ?page=&limit= and the tenant lists return a
// { data, page, limit, total } envelope sliced at the query level (skip/take)
// with total = the unpaged matching row count. Without params the full array
// is returned, as before.
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

async function login(): Promise<string> {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(res.status, 200, 'seed login works');
  return res.body.token as string;
}

test('clients: paginated envelope slices at DB level with unpaged total', async () => {
  const token = await login();
  const full = await api('/api/clients', {}, token);
  assert.equal(full.status, 200);
  const all = full.body as Record<string, any>[];
  assert.ok(all.length > 1, 'seed has more than one client');

  const page1 = await api('/api/clients?page=1&limit=1', {}, token);
  assert.equal(page1.status, 200);
  assert.deepEqual(
    { page: page1.body.page, limit: page1.body.limit, total: page1.body.total, len: page1.body.data.length },
    { page: 1, limit: 1, total: all.length, len: 1 },
  );
  const page2 = await api('/api/clients?page=2&limit=1', {}, token);
  assert.equal(page2.status, 200);
  assert.notEqual(page2.body.data[0].id, page1.body.data[0].id, 'page 2 returns a different row');
});

test('clients: no params keeps the full array', async () => {
  const token = await login();
  const res = await api('/api/clients', {}, token);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body), 'unpaged list is a bare array');
});

test('clients: invalid page parameters 400', async () => {
  const token = await login();
  const zero = await api('/api/clients?page=0', {}, token);
  assert.equal(zero.status, 400);
  const overflow = await api('/api/clients?page=99999999999', {}, token);
  assert.equal(overflow.status, 400);
  const bad = await api('/api/clients?limit=abc', {}, token);
  assert.equal(bad.status, 400);
});

test('documents: paginated envelope with derived pending quantities per page', async () => {
  const token = await login();
  const full = await api('/api/documents', {}, token);
  assert.equal(full.status, 200);
  const all = full.body as Record<string, any>[];
  assert.ok(all.length > 1, 'seed has more than one document');

  const page1 = await api('/api/documents?page=1&limit=1', {}, token);
  assert.equal(page1.status, 200);
  assert.deepEqual(
    { page: page1.body.page, limit: page1.body.limit, total: page1.body.total, len: page1.body.data.length },
    { page: 1, limit: 1, total: all.length, len: 1 },
  );
  const doc = page1.body.data[0] as Record<string, any>;
  assert.ok(Array.isArray(doc.items), 'document carries its items');
  assert.ok(doc.items.every((item: { pendingQuantity: number }) => Number.isFinite(item.pendingQuantity)),
    'pending quantities are derived on the page');
  assert.ok(Array.isArray(doc.payments), 'document carries its payments');
});