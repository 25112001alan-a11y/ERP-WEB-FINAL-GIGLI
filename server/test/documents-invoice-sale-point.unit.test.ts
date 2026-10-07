import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DocumentType } from '@prisma/client';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';

function installMocks(tx: Record<string, unknown>) {
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
  Object.defineProperty(prisma.companySubscription, 'findUnique', {
    value: mock.fn(async () => ({ plan: { code: 'pro', name: 'Profesional', priceMonthly: 0 } })),
    configurable: true,
  });
  // U6: the create route resolves the document currency from the company
  // maestro BEFORE opening the mocked transaction, using the real client.
  Object.defineProperty(prisma.company, 'findUnique', {
    value: mock.fn(async () => ({ currency: 'USD' })),
    configurable: true,
  });
  // The create route validates the document branch tenant BEFORE opening the
  // mocked transaction, using the real client.
  Object.defineProperty(prisma.branch, 'findFirst', {
    value: mock.fn(async () => ({ id: 2, companyId: 1, name: 'Casa Central' })),
    configurable: true,
  });
  Object.defineProperty(prisma, '$transaction', {
    value: mock.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    configurable: true,
  });
}

function restoreMocks() {
  Reflect.deleteProperty(prisma.user, 'findUnique');
  Reflect.deleteProperty(prisma.companySubscription, 'findUnique');
  Reflect.deleteProperty(prisma.company, 'findUnique');
  Reflect.deleteProperty(prisma.branch, 'findFirst');
  Reflect.deleteProperty(prisma, '$transaction');
}

test('a supplier invoice with a PV number uses the PV as its series and keeps the frozen number', async () => {
  let created: Record<string, unknown> | null = null;
  const tx = {
    cashBox: { findFirst: mock.fn(async () => null) },
    $queryRaw: mock.fn(async () => [{ nextNumber: 41 }]),
    $executeRaw: mock.fn(async () => 1),
    salePoint: {
      findFirst: mock.fn(async () => ({ id: 9 })),
    },
    document: {
      create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return { id: 72, number: 41, items: [], payments: [], invoiceData: null };
      }),
    },
    supplier: {
      findFirst: mock.fn(async () => ({ id: 4, name: 'Proveedor del Sur S.A.', taxId: '30-30112233-4' })),
    },
    branch: {
      findFirst: mock.fn(async () => ({ id: 2, companyId: 1, name: 'Casa Central' })),
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
  installMocks(tx);

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
          branchId: 2,
          invoice: { invoiceType: 'A', cae: '70123456789654', puntoVenta: 4 },
          items: [{ productId: 7, quantity: 2, unitPrice: 100 }],
        }),
      },
    );
    assert.equal(response.status, 201);

    assert.equal(created!.series, '0004');
    const invoiceData = (created!.invoiceData as { create: Record<string, unknown> }).create;
    assert.equal(invoiceData.puntoVenta, 4);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    restoreMocks();
  }
});

test('a PV that does not belong to the document branch is rejected with 400', async () => {
  let created: Record<string, unknown> | null = null;
  const tx = {
    cashBox: { findFirst: mock.fn(async () => null) },
    $queryRaw: mock.fn(async () => [{ nextNumber: 41 }]),
    $executeRaw: mock.fn(async () => 1),
    salePoint: {
      findFirst: mock.fn(async () => null),
    },
    document: {
      create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return { id: 72, number: 41, items: [], payments: [], invoiceData: null };
      }),
    },
    supplier: {
      findFirst: mock.fn(async () => ({ id: 4, name: 'Proveedor del Sur S.A.', taxId: '30-30112233-4' })),
    },
    branch: {
      findFirst: mock.fn(async () => ({ id: 2, companyId: 1, name: 'Casa Central' })),
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
  installMocks(tx);

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
          branchId: 2,
          invoice: { invoiceType: 'A', puntoVenta: 4 },
          items: [{ productId: 7, quantity: 2, unitPrice: 100 }],
        }),
      },
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? '', /no pertenece a la sucursal/);
    assert.equal(created, null);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    restoreMocks();
  }
});

test('U6: a factura without an explicit currency uses the company maestro (USD)', async () => {
  let created: Record<string, unknown> | null = null;
  const tx: Record<string, unknown> = {
    cashBox: { findFirst: mock.fn(async () => null) },
    $queryRaw: mock.fn(async () => [{ nextNumber: 41 }]),
    $executeRaw: mock.fn(async () => 1),
    salePoint: { findFirst: mock.fn(async () => ({ id: 9 })) },
    document: {
      create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return { id: 73, number: 41, items: [], payments: [], invoiceData: null };
      }),
    },
    supplier: { findFirst: mock.fn(async () => ({ id: 4, name: 'Proveedor del Sur S.A.', taxId: '30-30112233-4' })) },
    branch: { findFirst: mock.fn(async () => ({ id: 2, companyId: 1, name: 'Casa Central' })) },
    company: { findUnique: mock.fn(async () => ({ legalName: 'Del Sur Holding S.A.', taxId: '30-30000000-0' })) },
    product: {
      findFirst: mock.fn(async () => ({
        id: 7, name: 'Producto siete', internalCode: 'SKU-7', salePrice: 19.99,
        costPrice: 90, allowOversell: false, tax: { rate: 21 },
      })),
    },
    auditLog: { create: mock.fn(async () => ({ id: 92 })) },
  };
  installMocks(tx);

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
          branchId: 2,
          invoice: { invoiceType: 'A', cae: '70123456789654', puntoVenta: 4 },
          items: [{ productId: 7, quantity: 2, unitPrice: 100 }],
        }),
      },
    );
    assert.equal(response.status, 201);
    assert.equal(created!.currency, 'USD');
    assert.equal(created!.exchangeRate, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    restoreMocks();
  }
});

test('U6: an explicit currency and exchange rate reach the create and are not stripped', async () => {
  let created: Record<string, unknown> | null = null;
  const tx: Record<string, unknown> = {
    cashBox: { findFirst: mock.fn(async () => null) },
    $queryRaw: mock.fn(async () => [{ nextNumber: 41 }]),
    $executeRaw: mock.fn(async () => 1),
    salePoint: { findFirst: mock.fn(async () => ({ id: 9 })) },
    document: {
      create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return { id: 74, number: 41, items: [], payments: [], invoiceData: null };
      }),
    },
    supplier: { findFirst: mock.fn(async () => ({ id: 4, name: 'Proveedor del Sur S.A.', taxId: '30-30112233-4' })) },
    branch: { findFirst: mock.fn(async () => ({ id: 2, companyId: 1, name: 'Casa Central' })) },
    company: { findUnique: mock.fn(async () => ({ legalName: 'Del Sur Holding S.A.', taxId: '30-30000000-0' })) },
    product: {
      findFirst: mock.fn(async () => ({
        id: 7, name: 'Producto siete', internalCode: 'SKU-7', salePrice: 19.99,
        costPrice: 90, allowOversell: false, tax: { rate: 21 },
      })),
    },
    auditLog: { create: mock.fn(async () => ({ id: 92 })) },
  };
  installMocks(tx);

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
          branchId: 2,
          currency: 'USD',
          exchangeRate: 350,
          invoice: { invoiceType: 'A', cae: '70123456789654', puntoVenta: 4 },
          items: [{ productId: 7, quantity: 2, unitPrice: 100 }],
        }),
      },
    );
    assert.equal(response.status, 201);
    assert.equal(created!.currency, 'USD');
    assert.equal(created!.exchangeRate, 350);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    restoreMocks();
  }
});