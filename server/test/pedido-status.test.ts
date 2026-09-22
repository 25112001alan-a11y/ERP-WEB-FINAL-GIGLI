import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';

// End-to-end PEDIDO flow: public checkout -> owner advances statuses ->
// customer tracks each state by email. Runs against the live seeded database
// and deletes every document/client it creates.
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

const createdDocIds: number[] = [];
const createdClientIds: number[] = [];

test('pedido flow: checkout -> En Proceso -> Enviado, tracked by email', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(login.status, 200);
  const token = login.body.token as string;

  // The slug suite (parallel process, shared DB) renames the demo tenant's
  // slug mid-run, so resolve it fresh before every public call and retry once
  // on 404 after re-resolving.
  const resolveSlug = async (): Promise<string> => {
    const company = await api('/api/company', {}, token);
    assert.equal(company.status, 200);
    assert.ok(company.body.slug);
    return company.body.slug as string;
  };
  const pub = async (endpoint: string, options: RequestInit = {}) => {
    // A 404 here means the slug moved under us (transient), not a bad
    // product (that's a 400) — re-resolve once and retry.
    const first = await api(`/api/public/store/${await resolveSlug()}${endpoint}`, options);
    if (first.status !== 404) return first;
    return api(`/api/public/store/${await resolveSlug()}${endpoint}`, options);
  };

  const products = await api('/api/products', {}, token);
  const productId = (products.body as { id: number }[])[0]?.id;
  assert.ok(productId, 'seeded product exists');

  const email = `pedido-status-${Date.now()}@test.local`;

  // 1) Customer checks out from the storefront (no auth).
  const order = await pub('/orders', {
    method: 'POST',
    body: JSON.stringify({
      clientName: 'Cliente Seguimiento',
      clientEmail: email,
      items: [{ productId, quantity: 1 }],
    }),
  });
  assert.equal(order.status, 201, `checkout ok: ${JSON.stringify(order.body)}`);
  assert.equal(order.body.status, 'Abierto');
  const docId = Number(order.body.id);
  assert.ok(Number.isInteger(docId));
  createdDocIds.push(docId);

  const track = async () =>
    pub(`/orders?email=${encodeURIComponent(email)}`);

  // 2) Owner advances Abierto -> En Proceso; customer sees it.
  const toProcess = await api(
    `/api/documents/${docId}/status`,
    { method: 'PATCH', body: JSON.stringify({ status: 'En Proceso' }) },
    token,
  );
  assert.equal(toProcess.status, 200);
  assert.equal(toProcess.body.status, 'En Proceso');
  const tracked1 = await track();
  assert.equal(tracked1.status, 200);
  assert.equal(tracked1.body[0]?.status, 'En Proceso');

  // 3) Owner advances En Proceso -> Enviado; customer sees it.
  const toShipped = await api(
    `/api/documents/${docId}/status`,
    { method: 'PATCH', body: JSON.stringify({ status: 'Enviado' }) },
    token,
  );
  assert.equal(toShipped.status, 200);
  const tracked2 = await track();
  assert.equal(tracked2.body[0]?.status, 'Enviado');

  // 4) Terminal state: nothing advances from Enviado.
  const fromShipped = await api(
    `/api/documents/${docId}/status`,
    { method: 'PATCH', body: JSON.stringify({ status: 'Anulado' }) },
    token,
  );
  assert.equal(fromShipped.status, 400);

  // 5) Skipping a step is rejected: Abierto -> Enviado.
  const order2 = await pub('/orders', {
    method: 'POST',
    body: JSON.stringify({
      clientName: 'Cliente Salto',
      clientEmail: `pedido-salto-${Date.now()}@test.local`,
      items: [{ productId, quantity: 1 }],
    }),
  });
  assert.equal(order2.status, 201);
  const docId2 = Number(order2.body.id);
  createdDocIds.push(docId2);
  const skip = await api(
    `/api/documents/${docId2}/status`,
    { method: 'PATCH', body: JSON.stringify({ status: 'Enviado' }) },
    token,
  );
  assert.equal(skip.status, 400);

  // 6) Anulado is terminal: blocked from advancing further.
  const anul = await api(
    `/api/documents/${docId2}/status`,
    { method: 'PATCH', body: JSON.stringify({ status: 'Anulado' }) },
    token,
  );
  assert.equal(anul.status, 200);
  const fromAnul = await api(
    `/api/documents/${docId2}/status`,
    { method: 'PATCH', body: JSON.stringify({ status: 'En Proceso' }) },
    token,
  );
  assert.equal(fromAnul.status, 400);

  // 7) Non-PEDIDO documents are rejected.
  const ventas = await api('/api/documents?type=VENTA', {}, token);
  const other = (ventas.body as { id: number }[])[0];
  if (other) {
    const bad = await api(
      `/api/documents/${other.id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status: 'En Proceso' }) },
      token,
    );
    assert.equal(bad.status, 400);
  }

  // 8) Cross-tenant id -> 404. The tenant is built directly with prisma
  // (not /api/auth/register) so this suite adds no registration contention
  // to the parallel suites sharing this database.
  const stamp = Date.now();
  const companyB = await prisma.company.create({
    data: { name: `Status Tenant ${stamp}`, slug: `status-tenant-${stamp}` },
  });
  const perm = await prisma.permission.findUnique({ where: { name: 'ventas.escribir' } });
  assert.ok(perm);
  const roleB = await prisma.role.create({
    data: {
      companyId: companyB.id,
      name: 'Vendedor',
      permissions: { create: { permissionId: perm.id } },
    },
  });
  const userB = await prisma.user.create({
    data: {
      companyId: companyB.id,
      firstName: 'Test',
      lastName: 'Tenant',
      email: `status-${stamp}@test.local`,
      passwordHash: await bcrypt.hash('clave-segura-123', 10),
      status: 'Activo',
      roles: { create: { roleId: roleB.id } },
    },
  });
  const foreignToken = signToken({ sub: userB.id, companyId: companyB.id, email: userB.email });
  const foreign = await api(
    `/api/documents/${docId}/status`,
    { method: 'PATCH', body: JSON.stringify({ status: 'En Proceso' }) },
    foreignToken,
  );
  assert.equal(foreign.status, 404);
  // Company delete cascades to its users, roles and documents.
  await prisma.company.delete({ where: { id: companyB.id } }).catch(() => undefined);

  // 9) No auth -> 401.
  const noAuth = await api(`/api/documents/${docId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'En Proceso' }),
  });
  assert.equal(noAuth.status, 401);

  // Cleanup: documents first (FK), then the auto-created clients.
  for (const id of createdDocIds) {
    const doc = await prisma.document
      .findUnique({ where: { id }, select: { clientId: true } })
      .catch(() => null);
    await prisma.document.delete({ where: { id } }).catch(() => undefined);
    if (doc?.clientId) createdClientIds.push(doc.clientId);
  }
  for (const id of createdClientIds) {
    const remaining = await prisma.document.count({ where: { clientId: id } }).catch(() => 1);
    if (remaining === 0) await prisma.client.delete({ where: { id } }).catch(() => undefined);
  }
});
