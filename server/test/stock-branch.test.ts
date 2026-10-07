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

async function api(path: string, token: string, data?: object) {
  const response = await fetch(`${base}${path}`, {
    method: data ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

test('stock branch locks, owner access and guarded transfer rollback', async () => {
  const suffix = randomUUID();
  const permissions = await prisma.permission.findMany({
    where: { name: { in: ['inventario.leer', 'inventario.escribir'] } },
  });
  assert.equal(permissions.length, 2, 'local test database needs inventory permissions');

  const company = await prisma.company.create({
    data: { name: `Stock guard ${suffix}`, slug: `stock-guard-${suffix}` },
  });
  try {
    const [branchA, branchB] = await Promise.all([
      prisma.branch.create({ data: { companyId: company.id, name: 'Assigned' } }),
      prisma.branch.create({ data: { companyId: company.id, name: 'Other' } }),
    ]);
    const [source, destination, emptyDestination, foreign] = await Promise.all([
      prisma.warehouse.create({ data: { companyId: company.id, branchId: branchA.id, name: 'Source' } }),
      prisma.warehouse.create({ data: { companyId: company.id, branchId: branchA.id, name: 'Destination' } }),
      prisma.warehouse.create({ data: { companyId: company.id, branchId: branchA.id, name: 'Empty destination' } }),
      prisma.warehouse.create({ data: { companyId: company.id, branchId: branchB.id, name: 'Foreign' } }),
    ]);
    const role = await prisma.role.create({
      data: {
        companyId: company.id,
        name: 'Inventory',
        permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
      },
    });
    const ownerRole = await prisma.role.create({
      data: { companyId: company.id, name: 'Super Admin',
        permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } },
    });
    const makeUser = (label: string, branchId: number | null, roleId = role.id) => prisma.user.create({
      data: {
        companyId: company.id, branchId, firstName: label, lastName: 'Test',
        email: `stock-${label}-${suffix}@test.local`, passwordHash: 'unused',
        roles: { create: { roleId } },
      },
    });
    const [locked, owner, unassigned] = await Promise.all([
      makeUser('locked', branchA.id), makeUser('owner', null, ownerRole.id), makeUser('unassigned', null),
    ]);
    const lockedToken = signToken({ sub: locked.id, companyId: company.id, email: locked.email });
    const ownerToken = signToken({ sub: owner.id, companyId: company.id, email: owner.email });
    const unassignedToken = signToken({ sub: unassigned.id, companyId: company.id, email: unassigned.email });
    const tax = await prisma.tax.create({ data: { companyId: company.id, name: 'Test tax', rate: 0 } });
    const product = await prisma.product.create({
      data: { companyId: company.id, taxId: tax.id, name: 'Branch fixture', salePrice: 10, costPrice: 5 },
    });
    await prisma.stock.createMany({
      data: [
        { productId: product.id, warehouseId: source.id, quantity: 5, minStock: 0 },
        { productId: product.id, warehouseId: foreign.id, quantity: 3, minStock: 0 },
      ],
    });

    const warehouses = await api('/api/stock/warehouses', lockedToken);
    assert.equal(warehouses.status, 200);
    assert.deepEqual(new Set(warehouses.body.map((w: { id: number }) => w.id)),
      new Set([source.id, destination.id, emptyDestination.id]));
    const stocks = await api('/api/stock', lockedToken);
    assert.equal(stocks.status, 200);
    assert.deepEqual(stocks.body.map((s: { warehouseId: number }) => s.warehouseId), [source.id]);
    assert.deepEqual((await api(`/api/stock?warehouseId=${foreign.id}`, lockedToken)).body, []);
    assert.equal((await api('/api/stock/warehouses', ownerToken)).body.length, 4);
    assert.equal((await api('/api/stock', ownerToken)).body.length, 2);
    assert.equal((await api('/api/stock', unassignedToken)).status, 403);
    assert.equal((await api('/api/stock/adjust', unassignedToken, {
      productId: product.id, warehouseId: source.id, delta: 1, reason: 'Not assigned',
    })).status, 403);

    // The existing token must follow the current DB assignment, not its original branch.
    await prisma.user.update({ where: { id: locked.id }, data: { branchId: branchB.id } });
    assert.deepEqual((await api('/api/stock/warehouses', lockedToken)).body.map((w: { id: number }) => w.id), [foreign.id]);
    await prisma.user.update({ where: { id: locked.id }, data: { branchId: branchA.id } });

    const adjust = (token: string, warehouseId: number) => api('/api/stock/adjust', token, {
      productId: product.id, warehouseId, delta: 1, reason: 'Test adjustment',
    });
    const transfer = (token: string, fromWarehouseId: number, toWarehouseId: number, quantity: number) =>
      api('/api/stock/transfer', token, { productId: product.id, fromWarehouseId, toWarehouseId, quantity });
    const movementCount = () => prisma.stockMovement.count({ where: { productId: product.id } });
    const auditCount = () => prisma.auditLog.count({ where: { companyId: company.id } });

    assert.equal((await adjust(lockedToken, foreign.id)).status, 403);
    assert.equal((await transfer(lockedToken, source.id, foreign.id, 1)).status, 403);
    assert.equal((await transfer(lockedToken, foreign.id, destination.id, 1)).status, 403);
    assert.equal(await movementCount(), 0);
    assert.equal(await auditCount(), 0);
    assert.equal(Number((await prisma.stock.findUniqueOrThrow({
      where: { productId_warehouseId: { productId: product.id, warehouseId: foreign.id } },
    })).quantity), 3);

    assert.equal((await adjust(ownerToken, foreign.id)).status, 200);
    assert.equal((await transfer(ownerToken, foreign.id, destination.id, 1)).status, 201);
    assert.equal((await transfer(lockedToken, source.id, destination.id, 5)).status, 201);
    const movementBeforeFailure = await movementCount();
    const auditBeforeFailure = await auditCount();
    const insufficient = await transfer(lockedToken, source.id, emptyDestination.id, 1);
    assert.equal(insufficient.status, 409, JSON.stringify(insufficient.body));
    assert.equal(await movementCount(), movementBeforeFailure);
    assert.equal(await auditCount(), auditBeforeFailure);
    assert.equal(await prisma.stock.count({
      where: { productId: product.id, warehouseId: emptyDestination.id },
    }), 0);
    assert.equal(Number((await prisma.stock.findUniqueOrThrow({
      where: { productId_warehouseId: { productId: product.id, warehouseId: source.id } },
    })).quantity), 0);
  } finally {
    await prisma.stockMovement.deleteMany({ where: { product: { companyId: company.id } } });
    await prisma.auditLog.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { companyId: company.id } });
    await prisma.warehouse.deleteMany({ where: { companyId: company.id } });
    await prisma.branch.deleteMany({ where: { companyId: company.id } });
    await prisma.product.deleteMany({ where: { companyId: company.id } });
    await prisma.tax.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
    assert.equal(await prisma.company.count({ where: { id: company.id } }), 0);
  }
});
