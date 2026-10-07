import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DocumentType } from '@prisma/client';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';

test('a supplier invoice copies the supplier master identity into InvoiceData without a database', async () => {
  let created: Record<string, unknown> | null = null;

  const tx = {
    $queryRaw: mock.fn(async () => [{ nextNumber: 41 }]),
    $executeRaw: mock.fn(async () => 1),
    document: {
      create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return { id: 71, number: 41, items: [], payments: [], invoiceData: null };
      }),
    },
    supplier: {
      findFirst: mock.fn(async () => ({ id: 4, name: 'Proveedor del Sur S.A.', taxId: '30-30112233-4' })),
    },
    company: {
      findUnique: mock.fn(async () => ({ legalName: 'Del Sur Holding S.A.', taxId: '30-30000000-0' })),
    },
    product: {
      findFirst: mock.fn(async () => ({
        id: 7,
        name: 'Producto siete',
        internalCode: 'SKU-7',
        salePrice: 19.99,
        costPrice: 90,
        allowOversell: false,
        tax: { rate: 21 },
      })),
    },
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
  // A paid plan short-circuits the monthly document cap, so no count query runs.
  Object.defineProperty(prisma.companySubscription, 'findUnique', {
    value: mock.fn(async () => ({ plan: { code: 'pro', name: 'Profesional', priceMonthly: 0 } })),
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
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/documents`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${signToken({ sub: 1, companyId: 1, email: 'buyer@example.test' })}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: DocumentType.FACTURA,
          direction: 'ingreso',
          supplierId: 4,
          invoice: { invoiceType: 'A', cae: '70123456789654', puntoVenta: 4 },
          items: [{ productId: 7, quantity: 2, unitPrice: 100 }],
        }),
      },
    );
    assert.equal(response.status, 201);

    const invoiceData = (created!.invoiceData as { create: Record<string, string | null> }).create;
    assert.equal(invoiceData.supplierCuit, '30-30112233-4');
    assert.equal(invoiceData.supplierName, 'Proveedor del Sur S.A.');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    Reflect.deleteProperty(prisma.user, 'findUnique');
    Reflect.deleteProperty(prisma.companySubscription, 'findUnique');
    Reflect.deleteProperty(prisma, '$transaction');
  }
});