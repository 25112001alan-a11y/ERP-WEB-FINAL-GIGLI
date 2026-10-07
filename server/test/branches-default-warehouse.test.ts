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
  return { status: response.status, body: await response.json() };
}

test('branch default warehouse: set, clear, cross-branch and permission guards', async () => {
  const suffix = randomUUID();
  const permissions = await prisma.permission.findMany({
    where: { name: { in: ['configuracion.escribir', 'inventario.leer'] } },
  });
  assert.equal(permissions.length, 2, 'local test database needs configuracion.escribir + inventario.leer');

  const company = await prisma.company.create({
    data: { name: `Branch default ${suffix}`, slug: `branch-default-${suffix}` },
  });
  try {
    const [branchA, branchB] = await Promise.all([
      prisma.branch.create({ data: { companyId: company.id, name: 'Default target' } }),
      prisma.branch.create({ data: { companyId: company.id, name: 'Foreign branch' } }),
    ]);
    const [warehouseA, warehouseB] = await Promise.all([
      prisma.warehouse.create({ data: { companyId: company.id, branchId: branchA.id, name: 'Reception' } }),
      prisma.warehouse.create({ data: { companyId: company.id, branchId: branchB.id, name: 'Foreign wh' } }),
    ]);
    const ownerRole = await prisma.role.create({
      data: {
        companyId: company.id,
        name: 'Super Admin',
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const [owner, clerk] = await Promise.all([
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
    ]);
    const ownerToken = signToken({ sub: owner.id, companyId: company.id, email: owner.email });
    const clerkToken = signToken({ sub: clerk.id, companyId: company.id, email: clerk.email });

    // Roles without the settings permission cannot change branch defaults.
    assert.equal((await callApi(`/api/branches/${branchA.id}`, clerkToken, {
      method: 'PATCH', data: { defaultWarehouseId: warehouseA.id },
    })).status, 403);
    // Unknown/foreign branches and warehouses stay tenant-scoped.
    assert.equal((await callApi('/api/branches/999999', ownerToken, {
      method: 'PATCH', data: { defaultWarehouseId: warehouseA.id },
    })).status, 404);
    assert.equal((await callApi(`/api/branches/${branchA.id}`, ownerToken, {
      method: 'PATCH', data: { defaultWarehouseId: 999999 },
    })).status, 400);
    // A warehouse of another branch is rejected, not silently accepted.
    const cross = await callApi(`/api/branches/${branchA.id}`, ownerToken, {
      method: 'PATCH', data: { defaultWarehouseId: warehouseB.id },
    });
    assert.equal(cross.status, 400);
    assert.match(cross.body.error, /pertenecer a la sucursal/);

    // Happy path: set, expose through the warehouse catalog, then clear.
    const set = await callApi(`/api/branches/${branchA.id}`, ownerToken, {
      method: 'PATCH', data: { defaultWarehouseId: warehouseA.id },
    });
    assert.equal(set.status, 200);
    assert.equal(set.body.defaultWarehouseId, warehouseA.id);
    assert.ok((await prisma.branch.findUniqueOrThrow({ where: { id: branchA.id } })).defaultWarehouseId === warehouseA.id);

    const warehouses = await callApi('/api/stock/warehouses', ownerToken);
    assert.equal(warehouses.status, 200);
    const row = warehouses.body.find((w: { id: number }) => w.id === warehouseA.id);
    assert.equal(row.branch.defaultWarehouseId, warehouseA.id);
    assert.equal(warehouses.body.find((w: { id: number }) => w.id === warehouseB.id).branch.defaultWarehouseId, null);

    const cleared = await callApi(`/api/branches/${branchA.id}`, ownerToken, {
      method: 'PATCH', data: { defaultWarehouseId: null },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.defaultWarehouseId, null);
  } finally {
    await prisma.user.deleteMany({ where: { companyId: company.id } });
    await prisma.warehouse.deleteMany({ where: { companyId: company.id } });
    await prisma.branch.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
    assert.equal(await prisma.company.count({ where: { id: company.id } }), 0);
  }
});