import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';

let server: Server;
let base: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server?.close());

async function callApi(path: string, token: string, options: { method?: string; data?: object } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(options.data ? { body: JSON.stringify(options.data) } : {}),
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, body };
}

test('sale points: CRUD, permission guards, per-company uniqueness and tenancy', async () => {
  const suffix = randomUUID();
  const permissions = await prisma.permission.findMany({
    where: { name: { in: ['configuracion.escribir', 'configuracion.leer'] } },
  });
  assert.equal(permissions.length, 2, 'local test database needs configuracion.escribir + configuracion.leer');

  const [company, foreignCompany] = await Promise.all([
    prisma.company.create({ data: { name: `Sale points ${suffix}`, slug: `sale-points-${suffix}` } }),
    prisma.company.create({ data: { name: `Sale points foreign ${suffix}`, slug: `sale-points-foreign-${suffix}` } }),
  ]);
  try {
    const [branchA, branchB] = await Promise.all([
      prisma.branch.create({ data: { companyId: company.id, name: 'Casa Central' } }),
      prisma.branch.create({ data: { companyId: company.id, name: 'Sucursal' } }),
    ]);
    const foreignBranch = await prisma.branch.create({ data: { companyId: foreignCompany.id, name: 'Foreign' } });
    const ownerRole = await prisma.role.create({
      data: {
        companyId: company.id,
        name: 'Super Admin',
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const foreignOwnerRole = await prisma.role.create({
      data: {
        companyId: foreignCompany.id,
        name: 'Super Admin',
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const [owner, clerk, foreignOwner] = await Promise.all([
      prisma.user.create({
        data: {
          companyId: company.id, firstName: 'Owner', lastName: 'Test',
          email: `owner-${suffix}@test.local`, passwordHash: 'unused',
          roles: { create: { roleId: ownerRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          companyId: company.id, branchId: branchA.id, firstName: 'Clerk', lastName: 'Test',
          email: `clerk-${suffix}@test.local`, passwordHash: 'unused',
        },
      }),
      prisma.user.create({
        data: {
          companyId: foreignCompany.id, firstName: 'Foreign', lastName: 'Owner',
          email: `foreign-${suffix}@test.local`, passwordHash: 'unused',
          roles: { create: { roleId: foreignOwnerRole.id } },
        },
      }),
    ]);
    const ownerToken = signToken({ sub: owner.id, companyId: company.id, email: owner.email });
    const clerkToken = signToken({ sub: clerk.id, companyId: company.id, email: clerk.email });
    const foreignToken = signToken({ sub: foreignOwner.id, companyId: foreignCompany.id, email: foreignOwner.email });

    // Roles without config/compras/ventas reads are blocked from the registry.
    assert.equal((await callApi('/api/sale-points', clerkToken)).status, 403);
    assert.equal((await callApi('/api/sale-points', clerkToken, {
      method: 'POST', data: { branchId: branchA.id, number: 1 },
    })).status, 403);

    // A branch of another tenant is rejected at creation.
    assert.equal((await callApi('/api/sale-points', ownerToken, {
      method: 'POST', data: { branchId: foreignBranch.id, number: 9 },
    })).status, 400);

    // Happy path: create, list with branch name, patch name, delete.
    const created = await callApi('/api/sale-points', ownerToken, {
      method: 'POST', data: { branchId: branchA.id, number: 1, name: 'Mostrador' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.number, 1);
    assert.equal(created.body.branch.name, 'Casa Central');

    const duplicate = await callApi('/api/sale-points', ownerToken, {
      method: 'POST', data: { branchId: branchB.id, number: 1 },
    });
    assert.equal(duplicate.status, 409);

    const list = await callApi('/api/sale-points', ownerToken);
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].branch.id, branchA.id);

    const renamed = await callApi(`/api/sale-points/${created.body.id}`, ownerToken, {
      method: 'PATCH', data: { name: 'Mostrador principal' },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.name, 'Mostrador principal');

    // Moving to another branch of the same company is allowed; foreign stays 404.
    const moved = await callApi(`/api/sale-points/${created.body.id}`, ownerToken, {
      method: 'PATCH', data: { branchId: branchB.id },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.branch.id, branchB.id);
    assert.equal((await callApi(`/api/sale-points/${created.body.id}`, foreignToken, {
      method: 'PATCH', data: { name: 'X' },
    })).status, 404);

    const deleted = await callApi(`/api/sale-points/${created.body.id}`, ownerToken, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
    assert.equal((await callApi(`/api/sale-points/${created.body.id}`, ownerToken, { method: 'DELETE' })).status, 404);
    assert.equal(await prisma.salePoint.count({ where: { companyId: company.id } }), 0);
  } finally {
    await prisma.user.deleteMany({ where: { companyId: { in: [company.id, foreignCompany.id] } } });
    await prisma.salePoint.deleteMany({ where: { companyId: { in: [company.id, foreignCompany.id] } } });
    await prisma.branch.deleteMany({ where: { companyId: { in: [company.id, foreignCompany.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [company.id, foreignCompany.id] } } });
    assert.equal(await prisma.company.count({ where: { id: { in: [company.id, foreignCompany.id] } } }), 0);
  }
});