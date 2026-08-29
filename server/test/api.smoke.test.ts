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

test('GET /api/public/products without auth -> 200 with catalog', async () => {
  const { status, body } = await api('/api/public/products');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 1);
  assert.ok('price' in body[0]);
  assert.ok('stock' in body[0]);
});

test('GET /api/public/orders?email=unknown -> 200 empty list', async () => {
  const { status, body } = await api('/api/public/orders?email=nadie@test.local');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 0);
});

test('CORS: disallowed origin gets no access-control header', async () => {
  const res = await fetch(`${base}/api/health`, {
    headers: { origin: 'https://evil.example.com' },
  });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('CORS: allowed origin echoes the origin', async () => {
  const res = await fetch(`${base}/api/health`, {
    headers: { origin: 'http://localhost:3000' },
  });
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
});