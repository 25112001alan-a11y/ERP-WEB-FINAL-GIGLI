import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Prisma } from '@prisma/client';
import { DocumentType } from '@prisma/client';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';
import { buildHeaderSnapshot } from '../src/lib/headerSnapshots.js';

type HeaderBody = {
  companyName?: string | null;
  companyTaxId?: string | null;
  companyAddress?: string | null;
  companyProvince?: string | null;
  companyPostalCode?: string | null;
  companyTaxCondition?: string | null;
  clientName?: string | null;
  clientTaxId?: string | null;
  clientAddress?: string | null;
  supplierName?: string | null;
  supplierTaxId?: string | null;
  supplierAddress?: string | null;
  supplierProvince?: string | null;
  supplierPostalCode?: string | null;
  supplierTaxCondition?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  client?: {
    name?: string | null;
    taxId?: string | null;
    address?: string | null;
    province?: string | null;
    postalCode?: string | null;
    taxCondition?: string | null;
  } | null;
  branch?: { name?: string | null; address?: string | null } | null;
};

test('buildHeaderSnapshot freezes every header field from its master row', async () => {
  const tx = {
    company: {
      findUnique: mock.fn(async () => ({
        legalName: 'Nexus Demo SA',
        taxId: '30-71000000-1',
        address: 'Av. Empresa 10',
        province: 'CABA',
        postalCode: '1001',
        taxCondition: 'Responsable Inscripto',
      })),
    },
    client: { findFirst: mock.fn(async () => ({ name: 'Cliente Congelado', taxId: '20-40000000-2', address: 'Av. Clientes 100', province: 'Buenos Aires', postalCode: '1002', taxCondition: 'Responsable Inscripto' })) },
    supplier: {
      findFirst: mock.fn(async () => ({
        name: 'Proveedor Congelado',
        taxId: '30-50000000-3',
        address: 'Av. Proveedor 300',
        province: 'Buenos Aires',
        postalCode: '1900',
        taxCondition: 'Monotributo',
      })),
    },
    branch: { findFirst: mock.fn(async () => ({ name: 'Sucursal Congelada', address: 'Calle Branch 200' })) },
  };
  const snapshot = await buildHeaderSnapshot(
    tx as unknown as Prisma.TransactionClient,
    { companyId: 1, clientId: 5, supplierId: 6, branchId: 7 },
  );
  assert.deepEqual(snapshot, {
    companyName: 'Nexus Demo SA',
    companyTaxId: '30-71000000-1',
    companyAddress: 'Av. Empresa 10',
    companyProvince: 'CABA',
    companyPostalCode: '1001',
    companyTaxCondition: 'Responsable Inscripto',
    clientName: 'Cliente Congelado',
    clientTaxId: '20-40000000-2',
    clientAddress: 'Av. Clientes 100',
    clientProvince: 'Buenos Aires',
    clientPostalCode: '1002',
    clientTaxCondition: 'Responsable Inscripto',
    supplierName: 'Proveedor Congelado',
    supplierTaxId: '30-50000000-3',
    supplierAddress: 'Av. Proveedor 300',
    supplierProvince: 'Buenos Aires',
    supplierPostalCode: '1900',
    supplierTaxCondition: 'Monotributo',
    branchName: 'Sucursal Congelada',
    branchAddress: 'Calle Branch 200',
  });

  // Mutation check: the mapping must track its master input, not a constant.
  const renamed = await buildHeaderSnapshot(
    {
      ...tx,
      company: { findUnique: mock.fn(async () => ({ legalName: 'Nombre Renombrado', taxId: 'OTRO-TAX' })) },
    } as unknown as Prisma.TransactionClient,
    { companyId: 1, clientId: 5, supplierId: 6, branchId: 7 },
  );
  assert.equal(renamed.companyName, 'Nombre Renombrado');
  assert.notEqual(renamed.companyName, snapshot.companyName);
  assert.throws(() => assert.equal(renamed.companyName, 'Nexus Demo SA'), assert.AssertionError);

  // Without counterpart ids the snapshot keeps only the company identity.
  const bare = await buildHeaderSnapshot(tx as unknown as Prisma.TransactionClient, { companyId: 1 });
  assert.equal(bare.clientName, null);
  assert.equal(bare.supplierName, null);
  assert.equal(bare.supplierAddress, null);
  assert.equal(bare.branchName, null);
  assert.equal(bare.companyName, 'Nexus Demo SA');
});

test('buildHeaderSnapshot copies the supplier address instead of hardcoding it to null', async () => {
  const withAddress = {
    company: { findUnique: mock.fn(async () => ({ legalName: 'Nexus Demo SA', taxId: '30-71000000-1' })) },
    supplier: { findFirst: mock.fn(async () => ({ name: 'Proveedor Con Dirección', taxId: '30-50000000-3', address: 'Av. Proveedor 300' })) },
  };
  const populated = await buildHeaderSnapshot(
    withAddress as unknown as Prisma.TransactionClient,
    { companyId: 1, supplierId: 6 },
  );
  assert.equal(populated.supplierAddress, 'Av. Proveedor 300');

  // A supplier master without an address must stay NULL and never throw.
  const withoutAddress = {
    company: { findUnique: mock.fn(async () => ({ legalName: 'Nexus Demo SA', taxId: '30-71000000-1' })) },
    supplier: { findFirst: mock.fn(async () => ({ name: 'Proveedor Sin Dirección', taxId: '30-50000000-3' })) },
  };
  const empty = await buildHeaderSnapshot(
    withoutAddress as unknown as Prisma.TransactionClient,
    { companyId: 1, supplierId: 6 },
  );
  assert.equal(empty.supplierAddress, null);
});

test('POST /api/documents freezes company, counterpart and branch identity plus item sku/taxName without a database', async () => {
  let created: Record<string, unknown> | null = null;

  const tx = {
    $queryRaw: mock.fn(async () => [{ nextNumber: 51 }]),
    $executeRaw: mock.fn(async () => 1),
    document: {
      create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return { id: 55, number: 51, items: [] };
      }),
    },
    client: {
      findFirst: mock.fn(async () => ({
        id: 5,
        name: 'Cliente Snapshot',
        taxId: '20-111222333-4',
        address: 'Av. Siempreviva 742',
        province: 'Mendoza',
        postalCode: '5500',
        taxCondition: 'Responsable Inscripto',
      })),
    },
    supplier: {
      findFirst: mock.fn(async () => ({
        id: 6,
        name: 'Proveedor Snapshot',
        taxId: '30-444555666-9',
        address: 'Av. Proveedor 400',
        province: 'Córdoba',
        postalCode: '5000',
        taxCondition: 'Monotributo',
      })),
    },
    branch: {
      findFirst: mock.fn(async () => ({ id: 7, name: 'Sucursal Norte', address: 'Av. Norte 456' })),
    },
    company: {
      findUnique: mock.fn(async () => ({
        legalName: 'Empresa Snapshot SA',
        taxId: '30-99100000-8',
        address: 'Av. Empresa 100',
        province: 'Santa Fe',
        postalCode: '2000',
        taxCondition: 'Responsable Inscripto',
      })),
    },
    product: {
      findFirst: mock.fn(async () => ({
        id: 9,
        name: 'Producto U4',
        internalCode: 'SKU-U4-9',
        costPrice: 10,
        salePrice: 20,
        tax: { name: 'IVA 21%', rate: 21 },
        allowOversell: false,
      })),
    },
    auditLog: { create: mock.fn(async () => ({ id: 93 })) },
  };

  Object.defineProperty(prisma.user, 'findUnique', {
    value: mock.fn(async (args: { select?: { email?: boolean } }) => (args.select?.email
      ? {
        id: 1,
        companyId: 1,
        email: 'owner@example.test',
        status: 'Activo',
        branchId: null,
        roles: [{ roleId: 1 }],
      }
      : { roles: [{ role: { permissions: [{ permission: { name: 'ventas.escribir' } }] } }] })),
    configurable: true,
  });
  // A paid plan short-circuits the monthly document cap, so no count query runs.
  Object.defineProperty(prisma.companySubscription, 'findUnique', {
    value: mock.fn(async () => ({ plan: { code: 'pro' } })),
    configurable: true,
  });
  Object.defineProperty(prisma.branch, 'findFirst', {
    value: mock.fn(async () => ({ id: 7, companyId: 1, name: 'Sucursal Norte', address: 'Av. Norte 456' })),
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
          authorization: `Bearer ${signToken({ sub: 1, companyId: 1, email: 'owner@example.test' })}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: DocumentType.PEDIDO,
          clientId: 5,
          branchId: 7,
          items: [{ productId: 9, quantity: 3 }],
        }),
      },
    );
    assert.equal(response.status, 201);

    assert.equal(created!.companyName, 'Empresa Snapshot SA');
    assert.equal(created!.companyTaxId, '30-99100000-8');
    assert.equal(created!.companyAddress, 'Av. Empresa 100');
    assert.equal(created!.companyProvince, 'Santa Fe');
    assert.equal(created!.companyPostalCode, '2000');
    assert.equal(created!.companyTaxCondition, 'Responsable Inscripto');
    assert.equal(created!.clientName, 'Cliente Snapshot');
    assert.equal(created!.clientTaxId, '20-111222333-4');
    assert.equal(created!.clientAddress, 'Av. Siempreviva 742');
    assert.equal(created!.clientProvince, 'Mendoza');
    assert.equal(created!.clientPostalCode, '5500');
    assert.equal(created!.clientTaxCondition, 'Responsable Inscripto');
    // Supplier-side identity is covered by the /receive snapshot test below:
    // a document has exactly one counterpart, so a single creation cannot
    // freeze both a client and a supplier.
    assert.equal(created!.branchName, 'Sucursal Norte');
    assert.equal(created!.branchAddress, 'Av. Norte 456');

    const items = (created!.items as { create: Record<string, unknown>[] }).create;
    assert.equal(items.length, 1);
    assert.equal(items[0].sku, 'SKU-U4-9');
    assert.equal(items[0].taxName, 'IVA 21%');

    // Mutation check: the equality above must fail when the value is wrong.
    assert.throws(() => assert.equal(created!.companyName, 'Otra Empresa'), assert.AssertionError);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    Reflect.deleteProperty(prisma.user, 'findUnique');
    Reflect.deleteProperty(prisma.companySubscription, 'findUnique');
    Reflect.deleteProperty(prisma.branch, 'findFirst');
    Reflect.deleteProperty(prisma, '$transaction');
  }
});

test('POST /api/documents/:id/receive freezes company, supplier and branch identity on the remito without a database', async () => {
  const orderItems = [{
    id: 101,
    productId: 7,
    description: 'Producto siete',
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
    company: {
      findUnique: mock.fn(async () => ({
        legalName: 'Empresa Snapshot SA',
        taxId: '30-99100000-8',
        address: 'Av. Empresa 100',
        province: 'Santa Fe',
        postalCode: '2000',
        taxCondition: 'Responsable Inscripto',
      })),
    },
    branch: { findFirst: mock.fn(async () => ({ id: 2, name: 'Sucursal Central', address: 'Av. Siempreviva 100' })) },
    supplier: {
      findFirst: mock.fn(async () => ({
        id: 4,
        name: 'Proveedor Snapshot',
        taxId: '30-444555666-9',
        address: 'Av. Proveedor 400',
        province: 'Córdoba',
        postalCode: '5000',
        taxCondition: 'Monotributo',
      })),
    },
    product: {
      findFirst: mock.fn(async () => ({
        id: 7,
        name: 'Producto siete (nombre nuevo)',
        internalCode: 'SKU-7',
        costPrice: 90,
        tax: { name: 'IVA 25%', rate: 25 },
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
          idempotencyKey: '2c1f3a4b-5d6e-4f70-8a91-0b1c2d3e4f50',
          warehouseId: 3,
          items: [{ productId: 7, quantity: 4 }],
        }),
      },
    );
    assert.equal(response.status, 201);

    assert.equal(created!.companyName, 'Empresa Snapshot SA');
    assert.equal(created!.companyTaxId, '30-99100000-8');
    assert.equal(created!.companyAddress, 'Av. Empresa 100');
    assert.equal(created!.companyProvince, 'Santa Fe');
    assert.equal(created!.companyPostalCode, '2000');
    assert.equal(created!.companyTaxCondition, 'Responsable Inscripto');
    assert.equal(created!.supplierName, 'Proveedor Snapshot');
    assert.equal(created!.supplierTaxId, '30-444555666-9');
    assert.equal(created!.supplierAddress, 'Av. Proveedor 400');
    assert.equal(created!.supplierProvince, 'Córdoba');
    assert.equal(created!.supplierPostalCode, '5000');
    assert.equal(created!.supplierTaxCondition, 'Monotributo');
    assert.equal(created!.branchName, 'Sucursal Central');
    assert.equal(created!.branchAddress, 'Av. Siempreviva 100');
    // A goods receipt has no client counterpart at all.
    assert.equal(created!.clientName, null);

    const items = (created!.items as { create: Record<string, unknown>[] }).create;
    assert.equal(items.length, 1);
    assert.equal(items[0].sku, 'SKU-7');
    assert.equal(items[0].taxName, 'IVA 25%');

    // Mutation check: the equality above must fail when the value is wrong.
    assert.throws(() => assert.equal(created!.branchName, 'Otra Sucursal'), assert.AssertionError);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    Reflect.deleteProperty(prisma.user, 'findUnique');
    Reflect.deleteProperty(prisma.document, 'findFirst');
    Reflect.deleteProperty(prisma, '$transaction');
  }
});

test('GET /api/documents/:id prefers frozen header columns and falls back to live relations for legacy rows', async () => {
  const detail: Record<string, unknown> = {
    id: 10,
    companyId: 1,
    type: DocumentType.VENTA,
    series: 'A',
    number: 1,
    companyName: 'Empresa Snapshot SA',
    companyTaxId: '30-99100000-8',
    companyAddress: 'Av. Empresa 100',
    companyProvince: 'Santa Fe',
    companyPostalCode: '2000',
    companyTaxCondition: 'Responsable Inscripto',
    clientName: 'Cliente Congelado',
    clientTaxId: '20-111222333-4',
    clientAddress: 'Av. Siempreviva 742',
    clientProvince: 'Mendoza',
    clientPostalCode: '5500',
    clientTaxCondition: 'Responsable Inscripto',
    supplierName: 'Proveedor Congelado',
    supplierTaxId: '30-444555666-9',
    supplierAddress: null,
    supplierProvince: 'Córdoba',
    supplierPostalCode: '5000',
    supplierTaxCondition: 'Monotributo',
    branchName: 'Sucursal Congelada',
    branchAddress: null,
    // Live relations renamed after this document was issued.
    client: { name: 'Cliente Renombrado Vivo', taxId: '20-00000000-0', address: 'Viva 999', province: 'Córdoba', postalCode: '5000', taxCondition: 'Monotributo' },
    supplier: null,
    branch: { name: 'Sucursal Renombrada Vivo', address: 'Viva 11' },
    user: { id: 1, firstName: 'Ana', lastName: 'Gomez' },
    warehouse: null,
    destinationWarehouse: null,
    sourceDocument: null,
    items: [],
    payments: [],
    stockMovements: [],
    invoiceData: null,
  };

  Object.defineProperty(prisma.user, 'findUnique', {
    value: mock.fn(async (args: { select?: { email?: boolean } }) => (args.select?.email
      ? {
        id: 1,
        companyId: 1,
        email: 'owner@example.test',
        status: 'Activo',
        branchId: null,
        roles: [{ roleId: 1 }],
      }
      : {
        roles: [{
          role: {
            permissions: [
              { permission: { name: 'ventas.leer' } },
              { permission: { name: 'compras.leer' } },
            ],
          },
        }],
      })),
    configurable: true,
  });
  Object.defineProperty(prisma.document, 'findFirst', {
    value: mock.fn(async () => detail),
    configurable: true,
  });

  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const headers = { authorization: `Bearer ${signToken({ sub: 1, companyId: 1, email: 'owner@example.test' })}` };

    const frozen = await (await fetch(`${base}/api/documents/10`, { headers })).json() as HeaderBody;
    // Snapshot wins over the renamed live relation.
    assert.equal(frozen.clientName, 'Cliente Congelado');
    assert.equal(frozen.clientTaxId, '20-111222333-4');
    assert.equal(frozen.clientAddress, 'Av. Siempreviva 742');
    assert.equal(frozen.clientProvince, 'Mendoza');
    assert.equal(frozen.clientPostalCode, '5500');
    assert.equal(frozen.clientTaxCondition, 'Responsable Inscripto');
    assert.equal(frozen.companyName, 'Empresa Snapshot SA');
    assert.equal(frozen.companyTaxCondition, 'Responsable Inscripto');
    assert.equal(frozen.supplierName, 'Proveedor Congelado');
    assert.equal(frozen.supplierTaxCondition, 'Monotributo');
    assert.equal(frozen.branchName, 'Sucursal Congelada');
    // A NULL snapshot field still falls back to the live relation (branchAddress).
    assert.equal(frozen.branchAddress, 'Viva 11');
    // The live relations stay in the payload untouched.
    assert.equal(frozen.client?.name, 'Cliente Renombrado Vivo');
    // Mutation check: the equality above must fail when the value is wrong.
    assert.throws(() => assert.equal(frozen.clientName, 'Cliente Renombrado Vivo'), assert.AssertionError);

    // Legacy row: every snapshot column predates the feature and is NULL.
    for (const key of [
      'companyName', 'companyTaxId', 'companyAddress', 'companyProvince', 'companyPostalCode',
      'companyTaxCondition', 'clientName', 'clientTaxId', 'clientAddress',
      'clientProvince', 'clientPostalCode', 'clientTaxCondition',
      'supplierName', 'supplierTaxId', 'supplierAddress', 'supplierProvince',
      'supplierPostalCode', 'supplierTaxCondition', 'branchName', 'branchAddress',
    ] as const) {
      detail[key] = null;
    }
    const legacy = await (await fetch(`${base}/api/documents/10`, { headers })).json() as HeaderBody;
    assert.equal(legacy.clientName, 'Cliente Renombrado Vivo');
    assert.equal(legacy.clientTaxId, '20-00000000-0');
    assert.equal(legacy.clientAddress, 'Viva 999');
    assert.equal(legacy.clientProvince, 'Córdoba');
    assert.equal(legacy.clientPostalCode, '5000');
    assert.equal(legacy.clientTaxCondition, 'Monotributo');
    assert.equal(legacy.branchName, 'Sucursal Renombrada Vivo');
    assert.equal(legacy.branchAddress, 'Viva 11');
    // Company has no live relation in the payload, so it stays NULL.
    assert.equal(legacy.companyName, null);
    assert.equal(legacy.supplierName, null);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    Reflect.deleteProperty(prisma.user, 'findUnique');
    Reflect.deleteProperty(prisma.document, 'findFirst');
  }
});
