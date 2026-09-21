import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';

// Guards the platform/tenant boundary: company owners must never hold,
// see, or self-grant billing.manage (cross-tenant overview gate).

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

async function registerOwner() {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      companyName: `Platform Guard ${suffix}`,
      firstName: 'Due',
      lastName: 'No',
      email: `owner-${suffix}@test.local`,
      password: 'clave-segura-123',
    }),
  });
  assert.equal(reg.status, 201);
  return `Bearer ${reg.body.token}`;
}

test('new owner Super Admin excludes billing.manage but keeps billing.leer', async () => {
  const auth = await registerOwner();
  const { status, body } = await api('/api/auth/me', { headers: { authorization: auth } });
  assert.equal(status, 200);
  assert.ok(!body.permissions.includes('billing.manage'), 'owner must NOT hold billing.manage');
  assert.ok(body.permissions.includes('billing.leer'), 'owner keeps billing.leer (own-company UX)');
});

test('owner cannot reach the cross-tenant billing overview -> 403', async () => {
  const auth = await registerOwner();
  const { status } = await api('/api/billing/admin/overview', {
    headers: { authorization: auth },
  });
  assert.equal(status, 403);
});

test('permission catalog hides billing.manage from owners', async () => {
  const auth = await registerOwner();
  const { status, body } = await api('/api/users/permissions', {
    headers: { authorization: auth },
  });
  assert.equal(status, 200);
  const names = body.map((p: { name: string }) => p.name);
  assert.ok(!names.includes('billing.manage'), 'catalog must hide billing.manage from owners');
});

test('owner cannot self-grant billing.manage via role create/update -> 400', async () => {
  const auth = await registerOwner();

  const create = await api('/api/users/roles', {
    method: 'POST',
    headers: { authorization: auth },
    body: JSON.stringify({ name: 'Sneaky', permissionNames: ['ventas.leer', 'billing.manage'] }),
  });
  assert.equal(create.status, 400);

  const roles = await api('/api/users/roles', { headers: { authorization: auth } });
  assert.equal(roles.status, 200);
  const superAdmin = roles.body.find((r: { name: string }) => r.name === 'Super Admin');
  assert.ok(superAdmin);

  // Re-saving the owner's own Super Admin set (minus platform-only) stays valid.
  const patch = await api(`/api/users/roles/${superAdmin.id}`, {
    method: 'PATCH',
    headers: { authorization: auth },
    body: JSON.stringify({ permissionNames: superAdmin.permissions }),
  });
  assert.equal(patch.status, 200);
});

test('platform staff (ana.silva) keeps billing.manage: catalog + overview -> 200', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(login.status, 200);
  const auth = `Bearer ${login.body.token}`;

  const perms = await api('/api/users/permissions', { headers: { authorization: auth } });
  assert.equal(perms.status, 200);
  assert.ok(perms.body.some((p: { name: string }) => p.name === 'billing.manage'));

  const overview = await api('/api/billing/admin/overview', { headers: { authorization: auth } });
  assert.equal(overview.status, 200);
  assert.ok(typeof overview.body.totals.companies === 'number');
});
