import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// Opt-in only. This test owns its fixture and must never run against an ambient database.
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
const databaseName = databaseUrl.pathname.slice(1);
const expectedDatadir = path.join(os.tmpdir(), `f11-${databaseName.slice('nexus_f11_'.length)}`, 'data');
if (
  databaseUrl.protocol !== 'mysql:' ||
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.port === '' || databaseUrl.port === '3306' ||
  !/^nexus_f11_[a-f0-9]{12}$/.test(databaseName) ||
  process.env.F11_DISPOSABLE_DB !== databaseName ||
  !process.env.F11_LOCAL_DATADIR ||
  path.resolve(process.env.F11_LOCAL_DATADIR).toLowerCase() !== path.resolve(expectedDatadir).toLowerCase()
) {
  throw new Error('F1.1 integration requires an explicitly named disposable loopback MySQL database');
}

test('concurrent purchase-order receipts cannot over-receive or duplicate stock', async () => {
  const [{ app }, { prisma }, { signToken }] = await Promise.all([
    import('../src/app.js'),
    import('../src/lib/prisma.js'),
    import('../src/lib/jwt.js'),
  ]);
  const [{ datadir }] = await prisma.$queryRawUnsafe<{ datadir: string }[]>('SELECT @@datadir AS datadir');
  assert.equal(
    path.resolve(datadir).toLowerCase(),
    path.resolve(expectedDatadir).toLowerCase(),
    'connected server must be the disposable datadir created for this run',
  );

  const suffix = randomUUID().slice(0, 12);
  const company = await prisma.company.create({ data: { name: `F11 ${suffix}` } });
  const role = await prisma.role.create({ data: { companyId: company.id, name: 'Super Admin' } });
  const permission = await prisma.permission.create({ data: { name: `compras.escribir` } });
  await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  const user = await prisma.user.create({
    data: {
      companyId: company.id, firstName: 'F11', lastName: 'Tester',
      email: `f11-${suffix}@example.test`, passwordHash: 'not-used',
      roles: { create: { roleId: role.id } },
    },
  });
  const branch = await prisma.branch.create({ data: { companyId: company.id, name: 'F11 branch' } });
  const warehouse = await prisma.warehouse.create({
    data: { companyId: company.id, branchId: branch.id, name: 'F11 warehouse' },
  });
  const tax = await prisma.tax.create({ data: { companyId: company.id, name: 'F11 tax', rate: 0 } });
  const product = await prisma.product.create({
    data: {
      companyId: company.id, name: 'F11 product', salePrice: 10, costPrice: 10, taxId: tax.id,
    },
  });
  const order = await prisma.document.create({
    data: {
      companyId: company.id, type: 'OC', number: 1, userId: user.id,
      branchId: branch.id, warehouseId: warehouse.id,
      subtotal: 50, totalTax: 0, total: 50,
      items: { create: {
        productId: product.id, description: product.name, quantity: 5,
        unitPrice: 10, taxRate: 0, lineTotal: 50,
      } },
    },
    include: { items: true },
  });
  const token = signToken({ sub: user.id, companyId: company.id, email: user.email });
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const receive = async (key: string) => {
      const response = await fetch(`${base}/api/documents/${order.id}/receive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          idempotencyKey: key, warehouseId: warehouse.id,
          items: [{ productId: product.id, sourceDocumentItemId: order.items[0].id, quantity: 5 }],
        }),
      });
      return { status: response.status, body: await response.json() };
    };

    const [first, second] = await Promise.all([receive(randomUUID()), receive(randomUUID())]);
    assert.deepEqual([first.status, second.status].sort(), [201, 409], JSON.stringify([first, second]));
    const receipts = await prisma.document.findMany({
      where: { companyId: company.id, type: 'REMITO', sourceDocumentId: order.id },
      include: { items: true },
    });
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].items.length, 1);
    assert.equal(receipts[0].items[0].sourceDocumentItemId, order.items[0].id);
    assert.equal(Number(receipts[0].items[0].quantity), 5);
    const stock = await prisma.stock.findUniqueOrThrow({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });
    assert.equal(Number(stock.quantity), 5);
    const movements = await prisma.stockMovement.findMany({
      where: {
        productId: product.id,
        OR: [{ warehouseFromId: warehouse.id }, { warehouseToId: warehouse.id }],
      },
    });
    assert.equal(movements.length, 1);
    assert.equal(movements[0].documentId, receipts[0].id);
    assert.equal(Number(movements[0].quantity), 5);
    assert.equal((await prisma.document.findUniqueOrThrow({ where: { id: order.id } })).status, 'Recibido');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
