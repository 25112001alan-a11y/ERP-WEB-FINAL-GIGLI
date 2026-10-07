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

async function api(path: string, token?: string, method = 'GET', body?: object) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

test('branch boundaries across auth, product inventory, documents, payments and public checkout', async () => {
  const suffix = randomUUID();
  const names = ['inventario.leer', 'inventario.escribir', 'ventas.leer', 'ventas.escribir',
    'compras.leer', 'compras.escribir', 'usuarios.leer', 'usuarios.escribir', 'finanzas.leer', 'reportes.leer'];
  const permissions = await prisma.permission.findMany({ where: { name: { in: names } } });
  assert.equal(permissions.length, names.length, 'local test database needs the permission catalog');
  const company = await prisma.company.create({ data: { name: `Branch test ${suffix}`, slug: `branch-test-${suffix}` } });
  const other = await prisma.company.create({ data: { name: `Other test ${suffix}`, slug: `other-test-${suffix}` } });
  try {
    const a = await prisma.branch.create({ data: { companyId: company.id, name: 'A' } });
    const b = await prisma.branch.create({ data: { companyId: company.id, name: 'B' } });
    const c = await prisma.branch.create({ data: { companyId: other.id, name: 'C' } });
    const wa = await prisma.warehouse.create({ data: { companyId: company.id, branchId: a.id, name: 'A' } });
    const wb = await prisma.warehouse.create({ data: { companyId: company.id, branchId: b.id, name: 'B' } });
    const wc = await prisma.warehouse.create({ data: { companyId: other.id, branchId: c.id, name: 'C' } });
    const role = await prisma.role.create({ data: { companyId: company.id, name: 'Staff',
      permissions: { create: permissions.filter((p) => p.name !== 'reportes.leer')
        .map((p) => ({ permissionId: p.id })) } } });
    const ownerRole = await prisma.role.create({ data: { companyId: company.id, name: 'Super Admin',
      permissions: { create: permissions.map((p) => ({ permissionId: p.id })) } } });
    const strongerRole = await prisma.role.create({ data: { companyId: company.id, name: 'Reports',
      permissions: { create: { permissionId: permissions.find((p) => p.name === 'reportes.leer')!.id } } } });
    const createUser = async (label: string, branchId: number | null, roleId: number) => {
      const user = await prisma.user.create({ data: { companyId: company.id, branchId,
        firstName: label, lastName: 'Test', email: `${label}-${suffix}@test.local`,
        passwordHash: 'not-a-login-secret', roles: { create: { roleId } } } });
      return signToken({ sub: user.id, companyId: company.id, email: user.email });
    };
    const owner = await createUser('owner', null, ownerRole.id);
    const assigned = await createUser('assigned', a.id, role.id);
    const unassigned = await createUser('unassigned', null, role.id);
    const tax = await prisma.tax.create({ data: { companyId: company.id, name: 'Test', rate: 0 } });
    const taxOther = await prisma.tax.create({ data: { companyId: other.id, name: 'Test', rate: 0 } });
    const product = await prisma.product.create({ data: { companyId: company.id, taxId: tax.id,
      name: 'Test product', salePrice: 10, costPrice: 5 } });
    const foreignProduct = await prisma.product.create({ data: { companyId: other.id, taxId: taxOther.id,
      name: 'Other product', salePrice: 10, costPrice: 5 } });
    await prisma.stock.createMany({ data: [
      { productId: product.id, warehouseId: wa.id, quantity: 10, minStock: 0 },
      { productId: product.id, warehouseId: wb.id, quantity: 20, minStock: 0 },
    ] });
    const supplier = await prisma.supplier.create({ data: { companyId: company.id, name: 'Fixture supplier' } });
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: `owner-${suffix}@test.local` } })).id;
    const otherUser = await prisma.user.create({ data: { companyId: other.id, firstName: 'Other',
      lastName: 'Test', email: `other-${suffix}@test.local`, passwordHash: 'not-a-login-secret' } });
    await prisma.userRole.create({ data: { userId: otherUser.id, roleId: ownerRole.id } });
    const otherToken = signToken({ sub: otherUser.id, companyId: other.id, email: otherUser.email });
    const doc = (number: number, branchId: number | null, warehouseId: number | null) =>
      prisma.document.create({ data: { companyId: company.id, userId, type: 'OC', number,
        supplierId: supplier.id, branchId, warehouseId, subtotal: 10, totalTax: 0, total: 10,
        items: { create: { productId: product.id, description: 'Test product', quantity: 1,
          unitPrice: 10, taxRate: 0, lineTotal: 10 } } } });
    const otherDoc = await prisma.document.create({ data: { companyId: other.id, userId: otherUser.id,
      type: 'OC', number: 1, branchId: c.id, warehouseId: wc.id, subtotal: 10, totalTax: 0, total: 10 } });
    const da = await doc(1, a.id, wa.id);
    const db = await doc(2, b.id, wb.id);
    const fallback = await doc(3, null, wa.id);
    const unknown = await doc(4, null, null);
    const mismatch = await doc(5, a.id, wb.id);
    const pedidoB = await prisma.document.create({ data: { companyId: company.id, userId,
      type: 'PEDIDO', number: 1, branchId: b.id, warehouseId: wb.id,
      subtotal: 10, totalTax: 0, total: 10 } });
    const status = async (path: string, token: string, method = 'GET', body?: object) =>
      (await api(path, token, method, body)).status;

    assert.equal((await api('/api/auth/me', owner)).body.isOwner, true);
    assert.equal((await api('/api/auth/me', otherToken)).body.isOwner, false);
    assert.deepEqual((await api('/api/auth/me', otherToken)).body.permissions, []);
    assert.equal((await api('/api/auth/me', unassigned)).body.isOwner, false);
    assert.deepEqual((await api('/api/auth/me', unassigned)).body.allowedBranches, []);
    assert.equal((await api('/api/auth/me', assigned)).body.allowedBranches[0].id, a.id);
    const ownerId = userId;
    await prisma.user.update({ where: { id: ownerId }, data: { branchId: a.id } });
    assert.equal((await api('/api/auth/me', owner)).body.isOwner, true);
    assert.equal((await api('/api/auth/me', owner)).body.allowedBranches.length, 2);
    await prisma.user.update({ where: { id: ownerId }, data: { branchId: null } });
    assert.equal(await status('/api/users/roles', assigned, 'POST', {
      name: 'Super Admin', permissionNames: ['inventario.leer'],
    }), 403);
    assert.equal(await status(`/api/users/roles/${role.id}`, assigned, 'PATCH', {
      permissionNames: [...names],
    }), 400);
    assert.equal(await status('/api/users', assigned, 'POST', { firstName: 'Forbidden', lastName: 'User',
      email: `stronger-${suffix}@test.local`, password: randomUUID(), roleId: strongerRole.id,
    }), 403);
    assert.equal(await status('/api/users', assigned, 'POST', { firstName: 'Forbidden', lastName: 'User',
      email: `forbidden-${suffix}@test.local`, password: randomUUID(), roleId: ownerRole.id,
    }), 403);
    assert.equal((await api('/api/products', assigned)).body[0].stocks.length, 1);
    assert.equal((await api(`/api/products/${product.id}`, assigned)).body.stocks[0].warehouseId, wa.id);
    assert.deepEqual((await api(`/api/products/${product.id}`, unassigned)).body.stocks, []);
    assert.equal((await api(`/api/products/${product.id}`, owner)).body.stocks.length, 2);
    assert.equal(await status(`/api/products/${foreignProduct.id}`, assigned), 404);
    const productBody = { name: 'Created', salePrice: 10, taxId: tax.id, stockInicial: 2 };
    assert.equal(await status('/api/products', assigned, 'POST', { ...productBody, warehouseId: wb.id }), 403);
    assert.equal(await status('/api/products', unassigned, 'POST', { ...productBody, warehouseId: wa.id }), 403);
    const ownProduct = await api('/api/products', assigned, 'POST', { ...productBody, warehouseId: wa.id });
    assert.equal(ownProduct.status, 201);
    assert.equal((await prisma.stock.findFirstOrThrow({ where: { productId: ownProduct.body.id } })).warehouseId, wa.id);

    const list = await api('/api/documents', assigned);
    assert.equal(list.status, 200);
    assert.deepEqual(new Set(list.body.map((d: { id: number }) => d.id)), new Set([da.id, fallback.id]));
    assert.equal(await status(`/api/documents/${fallback.id}`, assigned), 200);
    assert.equal(await status(`/api/documents/${db.id}`, assigned), 404);
    assert.equal(await status(`/api/documents/${otherDoc.id}`, assigned), 404);
    assert.equal(await status(`/api/documents/${unknown.id}`, assigned), 404);
    assert.equal(await status(`/api/documents/${mismatch.id}`, assigned), 404);
    assert.equal(await status('/api/documents', unassigned), 403);
    assert.equal((await api('/api/documents', owner)).body.length, 6);
    assert.equal(await status(`/api/documents/${pedidoB.id}/status`, assigned, 'PATCH',
      { status: 'En Proceso' }), 404);
    assert.equal(await status(`/api/documents/${db.id}/external`, assigned, 'PATCH', { externalNumber: 'x' }), 404);
    assert.equal(await status(`/api/documents/${db.id}/receive`, assigned, 'POST', {
      warehouseId: wa.id, items: [{ productId: product.id, quantity: 1 }],
    }), 404);
    assert.equal(await status(`/api/documents/${da.id}/receive`, assigned, 'POST', {
      warehouseId: wb.id, items: [{ productId: product.id, quantity: 1 }],
    }), 403);
    const order = { type: 'OC', supplierId: supplier.id, warehouseId: wa.id,
      items: [{ productId: product.id, quantity: 1, warehouseId: wb.id }] };
    assert.equal(await status('/api/documents', assigned, 'POST', order), 403);
    assert.equal(await status('/api/documents', assigned, 'POST', { ...order, warehouseId: wc.id,
      items: [{ productId: product.id, quantity: 1 }] }), 400);
    assert.equal(await status('/api/documents', assigned, 'POST', { ...order,
      items: [{ productId: product.id, quantity: 1 }], sourceDocumentId: db.id }), 400);
    assert.equal(await status('/api/documents', assigned, 'POST', { ...order,
      items: [{ productId: product.id, quantity: 1 }], destinationWarehouseId: wb.id }), 403);
    assert.equal(await status('/api/documents', assigned, 'POST', { ...order,
      items: [{ productId: product.id, quantity: 1 }], branchId: b.id }), 403);
    assert.equal(await status('/api/documents', assigned, 'POST', { ...order,
      items: [{ productId: product.id, quantity: 1 }] }), 201);
    assert.equal(await status(`/api/documents/${db.id}`, owner), 200);
    assert.equal(await status(`/api/public/store/${company.slug}/orders`, undefined, 'POST', {
      clientName: 'Public fixture', warehouseId: wc.id, items: [{ productId: product.id, quantity: 1 }],
    }), 400);
    const payment = await prisma.payment.create({ data: { companyId: company.id, documentId: db.id,
      amount: 10, method: 'Tarjeta', status: 'Pendiente' } });
    assert.equal(await status(`/api/billing/payments/${payment.id}`, assigned), 404);
    assert.equal(await status('/api/billing/payments', assigned, 'POST', { documentId: db.id }), 404);
    assert.equal(await status('/api/finance', assigned), 200);
    assert.deepEqual((await api('/api/finance', assigned)).body, []);
    assert.equal(await status('/api/dashboard', unassigned), 403);
    assert.equal(await status('/api/stock', unassigned), 403);
    assert.equal(await prisma.stock.count({ where: { productId: product.id, warehouseId: wb.id, quantity: 20 } }), 1);
  } finally {
    await prisma.payment.deleteMany({ where: { companyId: { in: [company.id, other.id] } } });
    await prisma.stockMovement.deleteMany({ where: { product: { companyId: { in: [company.id, other.id] } } } });
    await prisma.document.deleteMany({ where: { companyId: { in: [company.id, other.id] } } });
    await prisma.documentCounter.deleteMany({ where: { companyId: { in: [company.id, other.id] } } });
    await prisma.auditLog.deleteMany({ where: { companyId: { in: [company.id, other.id] } } });
    await prisma.stock.deleteMany({ where: { product: { companyId: { in: [company.id, other.id] } } } });
    await prisma.product.deleteMany({ where: { companyId: { in: [company.id, other.id] } } });
    await prisma.supplier.deleteMany({ where: { companyId: company.id } });
    await prisma.client.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { companyId: { in: [company.id, other.id] } } });
    await prisma.role.deleteMany({ where: { companyId: company.id } });
    await prisma.warehouse.deleteMany({ where: { companyId: { in: [company.id, other.id] } } });
    await prisma.branch.deleteMany({ where: { companyId: { in: [company.id, other.id] } } });
    await prisma.tax.deleteMany({ where: { companyId: { in: [company.id, other.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [company.id, other.id] } } });
    assert.equal(await prisma.company.count({ where: { id: { in: [company.id, other.id] } } }), 0);
  }
});
