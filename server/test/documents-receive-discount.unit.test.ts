import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DocumentType } from '@prisma/client';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';

test('partial receipt of a discounted order line carries its proportional share without a database', async () => {
  // Ordered line: 10 units at 100 with a 50 discount over the whole line.
  const orderItems = [{
    id: 101,
    productId: 7,
    description: 'Producto siete (descripcion congelada)',
    quantity: 10,
    unitPrice: 100,
    taxRate: 25,
    discount: 50,
  }];

  let created: Record<string, unknown> | null = null;
  let rawQueryCount = 0;

  const tx = {
    $queryRaw: mock.fn(async () => (++rawQueryCount === 1 ? [{ id: 10 }] : [{ nextNumber: 51 }])),
    $executeRaw: mock.fn(async () => 1),
    document: {
      findFirst: mock.fn(async (args: { where: { id?: number } }) => (args.where.id === 10
        ? {
          id: 10,
          companyId: 1,
          type: DocumentType.OC,
          status: 'Abierto',
          supplierId: 4,
          branchId: 2,
          warehouseId: 3,
          number: 20,
          items: orderItems,
        }
        : null)),
      findMany: mock.fn(async () => []),
      create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return { id: 55, number: 51, items: [] };
      }),
      update: mock.fn(async () => ({ id: 10 })),
    },
    warehouse: { findFirst: mock.fn(async () => ({ id: 3, companyId: 1, branchId: 2 })) },
    // Master rows the header snapshot freezes at creation time.
    company: { findUnique: mock.fn(async () => ({ legalName: 'Nexus Demo SA', taxId: '30-99999999-9' })) },
    branch: { findFirst: mock.fn(async () => ({ id: 2, name: 'Sucursal Central', address: 'Av. Siempreviva 100' })) },
    supplier: { findFirst: mock.fn(async () => ({ id: 4, name: 'Proveedor Demo S.A.', taxId: '30-44444444-4' })) },
    // Renamed in the catalog after the order was issued.
    product: {
      findFirst: mock.fn(async () => ({
        id: 7,
        name: 'Producto siete (nombre nuevo)',
        costPrice: 90,
        tax: { rate: 25 },
      })),
    },
    stock: { upsert: mock.fn(async () => ({ productId: 7, warehouseId: 3 })) },
    stockMovement: { create: mock.fn(async () => ({ id: 91 })) },
    auditLog: { create: mock.fn(async () => ({ id: 92 })) },
  };

  Object.defineProperty(prisma.user, 'findUnique', {
    value: mock.fn(async (args: { select?: { email?: boolean } }) => (args.select?.email
      ? {
        id: 1,
        companyId: 1,
        email: 'buyer@example.test',
        status: 'Activo',
        branchId: null,
        roles: [{ roleId: 1 }],
      }
      : { roles: [{ role: { permissions: [{ permission: { name: 'compras.escribir' } }] } }] })),
    configurable: true,
  });
  Object.defineProperty(prisma.document, 'findFirst', {
    value: mock.fn(async () => null),
    configurable: true,
  });
  Object.defineProperty(prisma, '$transaction', {
    value: mock.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    configurable: true,
  });

  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/documents/10/receive`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${signToken({ sub: 1, companyId: 1, email: 'buyer@example.test' })}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          idempotencyKey: '1b0f2e5c-8b6c-4f5b-9a1e-3f4a5b6c7d8e',
          warehouseId: 3,
          items: [{ productId: 7, quantity: 4 }],
        }),
      },
    );
    assert.equal(response.status, 201);

    // The 4 received units carry 4/10 of the 50 ordered discount, not zero.
    const createdItems = (created!.items as { create: Record<string, string | number>[] }).create;
    assert.equal(createdItems.length, 1);
    assert.equal(createdItems[0].discount, 20);
    assert.equal(createdItems[0].lineTotal, 380); // 4 * 100 - 20
    assert.equal(createdItems[0].description, 'Producto siete (descripcion congelada)');
    assert.equal(created!.subtotal, 380);
    assert.equal(created!.totalTax, 95);
    assert.equal(created!.total, 475);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    Reflect.deleteProperty(prisma.user, 'findUnique');
    Reflect.deleteProperty(prisma.document, 'findFirst');
    Reflect.deleteProperty(prisma, '$transaction');
  }
});
