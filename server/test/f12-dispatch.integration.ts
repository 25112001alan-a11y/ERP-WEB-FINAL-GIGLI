import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// Opt-in only: reject ambient, default-port, remote, or reused databases before importing Prisma.
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
const databaseName = databaseUrl.pathname.slice(1);
const expectedDatadir = path.join(os.tmpdir(), `f12-${databaseName.slice('nexus_f12_'.length)}`, 'data');
if (
  databaseUrl.protocol !== 'mysql:' ||
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.port === '' || databaseUrl.port === '3306' ||
  !/^nexus_f12_[a-f0-9]{12}$/.test(databaseName) ||
  process.env.F12_DISPOSABLE_DB !== databaseName ||
  !process.env.F12_LOCAL_DATADIR ||
  path.resolve(process.env.F12_LOCAL_DATADIR).toLowerCase() !== path.resolve(expectedDatadir).toLowerCase()
) {
  throw new Error('F1.2 integration requires an explicitly named disposable loopback MySQL database');
}

test('concurrent order dispatch moves stock once and failed dispatch rolls back', async () => {
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
  const company = await prisma.company.create({ data: { name: `F12 ${suffix}` } });
  const role = await prisma.role.create({ data: { companyId: company.id, name: 'Dispatch Tester' } });
  for (const name of ['ventas.escribir', 'ventas.leer']) {
    const permission = await prisma.permission.create({ data: { name } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const user = await prisma.user.create({
    data: {
      companyId: company.id, firstName: 'F12', lastName: 'Tester',
      email: `f12-${suffix}@example.test`, passwordHash: 'not-used',
      roles: { create: { roleId: role.id } },
    },
  });
  const client = await prisma.client.create({ data: { companyId: company.id, name: 'F12 client' } });
  const branch = await prisma.branch.create({ data: { companyId: company.id, name: 'F12 branch' } });
  await prisma.user.update({ where: { id: user.id }, data: { branchId: branch.id } });
  const warehouse = await prisma.warehouse.create({
    data: { companyId: company.id, branchId: branch.id, name: 'F12 warehouse' },
  });
  const tax = await prisma.tax.create({ data: { companyId: company.id, name: 'F12 tax', rate: 0 } });
  const product = await prisma.product.create({
    data: { companyId: company.id, name: 'F12 product', salePrice: 10, costPrice: 10, taxId: tax.id },
  });
  await prisma.stock.create({ data: { productId: product.id, warehouseId: warehouse.id, quantity: 10, minStock: 0 } });
  const order = await prisma.document.create({
    data: {
      companyId: company.id, type: 'PEDIDO', number: 1, userId: user.id,
      clientId: client.id, branchId: branch.id, subtotal: 50, totalTax: 0, total: 50,
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
    const dispatch = async (sourceId: number, items: { productId: number; sourceDocumentItemId: number; quantity: number }[]) => {
      const response = await fetch(`${base}/api/documents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: 'REMITO', direction: 'egreso', sourceDocumentId: sourceId,
          warehouseId: warehouse.id, items,
        }),
      });
      return { status: response.status, body: await response.json() };
    };
    const fullLine = [{ productId: product.id, sourceDocumentItemId: order.items[0].id, quantity: 5 }];
    const [first, second] = await Promise.all([dispatch(order.id, fullLine), dispatch(order.id, fullLine)]);
    assert.deepEqual([first.status, second.status].sort(), [201, 409], JSON.stringify([first, second]));

    const remitos = await prisma.document.findMany({
      where: { companyId: company.id, type: 'REMITO', sourceDocumentId: order.id },
      include: { items: true },
    });
    assert.equal(remitos.length, 1);
    assert.equal(remitos[0].items.length, 1);
    assert.equal(remitos[0].items[0].sourceDocumentItemId, order.items[0].id);
    assert.equal(Number(remitos[0].items[0].quantity), 5);
    const stockKey = { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } };
    assert.equal(Number((await prisma.stock.findUniqueOrThrow({ where: stockKey })).quantity), 5);
    const movements = await prisma.stockMovement.findMany({
      where: { productId: product.id, warehouseFromId: warehouse.id },
    });
    assert.equal(movements.length, 1);
    assert.equal(movements[0].type, 'SALIDA');
    assert.equal(movements[0].documentId, remitos[0].id);
    assert.equal(Number(movements[0].quantity), 5);
    const list = await fetch(`${base}/api/documents?type=PEDIDO`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(list.status, 200);
    const pedidos = await list.json() as { id: number; items: { pendingQuantity: number }[] }[];
    assert.equal(Number(pedidos.find((document) => document.id === order.id)?.items[0]?.pendingQuantity), 0);

    // Both source lines pass the pre-check against stock 5, then the second
    // guarded decrement fails after the first line/doc/movement were written.
    const rollbackOrder = await prisma.document.create({
      data: {
        companyId: company.id, type: 'PEDIDO', number: 2, userId: user.id,
        clientId: client.id, branchId: branch.id, subtotal: 60, totalTax: 0, total: 60,
        items: { create: [1, 2].map(() => ({
          productId: product.id, description: product.name, quantity: 3,
          unitPrice: 10, taxRate: 0, lineTotal: 30,
        })) },
      },
      include: { items: true },
    });
    const rejected = await dispatch(rollbackOrder.id, rollbackOrder.items.map((item) => ({
      productId: product.id, sourceDocumentItemId: item.id, quantity: 3,
    })));
    assert.equal(rejected.status, 400, JSON.stringify(rejected));
    assert.equal(await prisma.document.count({
      where: { companyId: company.id, type: 'REMITO', sourceDocumentId: rollbackOrder.id },
    }), 0);
    assert.equal(Number((await prisma.stock.findUniqueOrThrow({ where: stockKey })).quantity), 5);
    assert.equal(await prisma.stockMovement.count({
      where: { productId: product.id, warehouseFromId: warehouse.id },
    }), 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
