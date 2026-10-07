import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DocumentType } from '@prisma/client';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';

type MockItem = {
  id: number;
  productId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
};

type MockSource = {
  id: number;
  series: string;
  number: number;
  type: DocumentType;
  status: string;
  clientId: number | null;
  supplierId: number | null;
  branchId: number | null;
  warehouseId: number | null;
  destinationWarehouseId: number | null;
  items: MockItem[];
};

type MockChild = {
  type: DocumentType;
  items: { sourceDocumentItemId?: number | null; productId: number | null; quantity: number }[];
};

test('derived invoices and delivery notes enforce direction, source identity and pending balances without a database', async () => {
  let permissions = ['ventas.escribir', 'compras.escribir'];
  const userLookup = mock.fn(async (args: { select?: { email?: boolean } }) => {
    if (args.select?.email) {
      return {
        id: 1,
        companyId: 1,
        email: 'owner@example.test',
        status: 'Activo',
        branchId: null,
        roles: [{ roleId: 1 }],
      };
    }
    return {
      roles: [{
        role: {
          permissions: permissions.map((name) => ({ permission: { name } })),
        },
      }],
    };
  });

  const sale = (): MockSource => ({
    id: 10,
    series: 'A',
    number: 1,
    type: DocumentType.VENTA,
    status: 'Abierto',
    clientId: 20,
    supplierId: null,
    branchId: 2,
    warehouseId: 3,
    destinationWarehouseId: null,
    items: [{
      id: 101,
      productId: 7,
      description: 'Producto siete',
      quantity: 5,
      unitPrice: 100,
      taxRate: 21,
      discount: 0,
    }],
  });
  const supplierReceipt = (): MockSource => ({
    ...sale(),
    id: 30,
    type: DocumentType.REMITO,
    clientId: null,
    supplierId: 40,
  });

  let source = sale();
  let children: MockChild[] = [];
  let createdData: Record<string, unknown> | null = null;
  let stockQuantity = 5;
  let warehouseBranchId = 2;
  let allowOversell = false;
  const movements: { type: string; quantity: number; documentId: number; warehouseFromId: number | null }[] = [];
  const events: string[] = [];
  const sourceUpdates: string[] = [];

  const tx = {
    $queryRaw: mock.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('SELECT id FROM comprobantes')) {
        events.push('lock-source');
        return [{ id: source.id }];
      }
      return [{ nextNumber: 71 }];
    }),
    $executeRaw: mock.fn(async () => 1),
    document: {
      findFirst: mock.fn(async () => {
        events.push('read-source');
        return source;
      }),
      findMany: mock.fn(async () => {
        events.push('read-children');
        return children;
      }),
      create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => {
        createdData = data;
        return { id: 80, number: 71, items: [], payments: [], invoiceData: null };
      }),
      update: mock.fn(async ({ data }: { data: { status: string } }) => {
        sourceUpdates.push(data.status);
        source.status = data.status;
        return source;
      }),
      count: mock.fn(async () => children.filter((child) => child.type === DocumentType.REMITO).length),
    },
    client: {
      findFirst: mock.fn(async () => ({ id: 20 })),
      create: mock.fn(async () => ({ id: 20 })),
    },
    supplier: {
      findFirst: mock.fn(async () => null),
      create: mock.fn(async () => ({ id: 40 })),
    },
    warehouse: {
      findFirst: mock.fn(async () => {
        events.push('read-warehouse');
        return { id: 3, companyId: 1, branchId: warehouseBranchId };
      }),
    },
    // Master rows the header snapshot freezes at creation time.
    company: {
      findUnique: mock.fn(async () => ({ legalName: 'Nexus Demo SA', taxId: '30-99999999-9' })),
    },
    branch: {
      findFirst: mock.fn(async () => ({ id: 2, name: 'Sucursal Central', address: 'Av. Siempreviva 100' })),
    },
    stock: {
      findUnique: mock.fn(async () => ({ quantity: stockQuantity })),
      updateMany: mock.fn(async ({ where, data }: {
        where: { quantity: { gte: number } };
        data: { quantity: { decrement: number } };
      }) => {
        events.push('decrement-stock');
        if (stockQuantity < where.quantity.gte) return { count: 0 };
        stockQuantity -= data.quantity.decrement;
        return { count: 1 };
      }),
    },
    stockMovement: {
      create: mock.fn(async ({ data }: { data: typeof movements[number] }) => {
        movements.push(data);
        return { id: movements.length };
      }),
    },
    product: {
      findFirst: mock.fn(async ({ where }: { where: { id: number } }) => ({
        id: where.id,
        name: `Producto ${where.id}`,
        internalCode: `P-${where.id}`,
        salePrice: 999,
        allowOversell,
        tax: { rate: 21 },
      })),
    },
    auditLog: {
      create: mock.fn(async () => ({ id: 90 })),
    },
  };
  const transaction = mock.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );

  Object.defineProperty(prisma.user, 'findUnique', { value: userLookup, configurable: true });
  Object.defineProperty(prisma.companySubscription, 'findUnique', {
    value: mock.fn(async () => null),
    configurable: true,
  });
  Object.defineProperty(prisma.document, 'count', {
    value: mock.fn(async () => 0),
    configurable: true,
  });
  Object.defineProperty(prisma, '$transaction', { value: transaction, configurable: true });

  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const token = signToken({ sub: 1, companyId: 1, email: 'owner@example.test' });
    const post = async (body: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/documents`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      return { response, body: await response.json() as { error?: string } };
    };
    const patchStatus = async (status: string) => {
      const response = await fetch(`${base}/api/documents/10/status`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      return { status: response.status, body: await response.json() as { error?: string } };
    };
    const invoice = (overrides: Record<string, unknown> = {}) => ({
      type: 'FACTURA',
      direction: 'egreso',
      sourceDocumentId: 10,
      items: [{ productId: 7, quantity: 2, unitPrice: 999 }],
      invoice: { invoiceType: 'A' },
      ...overrides,
    });
    const delivery = (overrides: Record<string, unknown> = {}) => ({
      type: 'REMITO',
      direction: 'egreso',
      sourceDocumentId: 10,
      items: [{ productId: 7, quantity: 2, unitPrice: 999 }],
      ...overrides,
    });

    let result: Awaited<ReturnType<typeof post>>;
    source = { ...sale(), type: DocumentType.PEDIDO, warehouseId: null };
    children = [];
    events.length = 0;
    result = await post(delivery({ warehouseId: 3, items: [{ productId: 7, sourceDocumentItemId: 101, quantity: 2 }] }));
    assert.equal(result.response.status, 201);
    assert.equal(events[0], 'lock-source', 'the source lock must precede any nonlocking transaction read');
    assert.ok(events.indexOf('lock-source') < events.indexOf('read-warehouse'));
    assert.ok(events.indexOf('lock-source') < events.indexOf('read-children'));
    assert.equal(stockQuantity, 3);
    assert.deepEqual(sourceUpdates, [], 'a partial REMITO must not ship the PEDIDO');
    assert.equal(movements.length, 1);
    assert.deepEqual(movements[0], { productId: 7, warehouseFromId: 3, warehouseToId: null,
      quantity: 2, type: 'SALIDA', reason: 'REMITO A-0071', userId: 1, documentId: 80 });
    assert.equal(createdData?.warehouseId, 3);
    children = [{ type: DocumentType.REMITO, items: [{ productId: 7, sourceDocumentItemId: 101, quantity: 2 }] }];
    assert.equal((await patchStatus('Enviado')).status, 400, 'manual shipping cannot bypass a REMITO');
    const cancelAfterPartial = await patchStatus('Anulado');
    assert.equal(cancelAfterPartial.status, 409, JSON.stringify(cancelAfterPartial.body));
    assert.equal(source.status, 'Abierto');
    result = await post(delivery({ warehouseId: 3, items: [{ productId: 7, sourceDocumentItemId: 101, quantity: 3 }] }));
    assert.equal(result.response.status, 201);
    assert.equal(stockQuantity, 0);
    assert.equal(movements.length, 2);
    assert.equal(source.status, 'Enviado');
    assert.deepEqual(sourceUpdates, ['Enviado']);
    children.push({ type: DocumentType.REMITO, items: [{ productId: 7, sourceDocumentItemId: 101, quantity: 3 }] });
    result = await post(delivery({ warehouseId: 3, items: [{ productId: 7, sourceDocumentItemId: 101, quantity: 1 }] }));
    assert.equal(result.response.status, 409);
    assert.equal(stockQuantity, 0);
    assert.equal(movements.length, 2);
    children = [];
    result = await post(delivery({ items: [{ productId: 7, sourceDocumentItemId: 101, quantity: 1 }] }));
    assert.equal(result.response.status, 400);
    warehouseBranchId = 4;
    result = await post(delivery({ warehouseId: 3, items: [{ productId: 7, sourceDocumentItemId: 101, quantity: 1 }] }));
    assert.equal(result.response.status, 409);
    assert.equal(movements.length, 2);
    warehouseBranchId = 2;
    stockQuantity = 0;
    allowOversell = true;
    result = await post(delivery({ warehouseId: 3, items: [{ productId: 7, sourceDocumentItemId: 101, quantity: 1 }] }));
    assert.equal(result.response.status, 409);
    assert.equal(movements.length, 2);
    allowOversell = false;
    stockQuantity = 5;
    source = sale();
    result = await post(delivery());
    assert.equal(result.response.status, 201);
    assert.equal(stockQuantity, 5, 'a POS sale must not be deducted twice');
    assert.equal(movements.length, 2);
    events.length = 0;

    permissions = ['compras.escribir'];
    result = await post(invoice());
    assert.equal(result.response.status, 403);
    assert.equal(result.body.error, 'Permiso requerido: ventas.escribir');
    result = await post(delivery());
    assert.equal(result.response.status, 403);
    assert.equal(result.body.error, 'Permiso requerido: ventas.escribir');

    permissions = ['ventas.escribir'];
    source = supplierReceipt();
    result = await post(invoice({ direction: 'ingreso', sourceDocumentId: 30 }));
    assert.equal(result.response.status, 403);
    assert.equal(result.body.error, 'Permiso requerido: compras.escribir');
    result = await post({
      type: 'REMITO',
      direction: 'ingreso',
      supplierId: 40,
      warehouseId: 3,
      items: [{ productId: 7, quantity: 1 }],
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.body.error, 'Permiso requerido: compras.escribir');

    permissions = ['compras.escribir'];
    const transactionCountBeforeBypass = transaction.mock.callCount();
    result = await post({
      type: 'REMITO',
      direction: 'ingreso',
      sourceDocumentId: 30,
      items: [{ productId: 7, quantity: 1 }],
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error, 'Use POST /api/documents/:id/receive para recibir una orden de compra');
    assert.equal(transaction.mock.callCount(), transactionCountBeforeBypass);

    permissions = ['ventas.escribir'];
    source = sale();
    children = [];
    result = await post(invoice({ clientId: 21 }));
    assert.equal(result.response.status, 409);
    assert.equal(result.body.error, 'El cliente no coincide con el documento origen');

    const transactionCountBeforeDuplicate = transaction.mock.callCount();
    result = await post(invoice({
      items: [
        { productId: 7, quantity: 1 },
        { productId: 7, quantity: 1 },
      ],
    }));
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error, 'No se puede repetir el mismo producto en un FACTURA derivado');
    assert.equal(transaction.mock.callCount(), transactionCountBeforeDuplicate);

    result = await post(invoice({ items: [{ productId: 8, quantity: 1 }] }));
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error, 'El producto 8 no pertenece al documento origen');

    source.items.push({ ...source.items[0]!, id: 102, quantity: 4 });
    result = await post(invoice({ items: [{ productId: 7, quantity: 1 }] }));
    assert.equal(result.response.status, 400);
    assert.match(result.body.error ?? '', /varias líneas de origen/);
    result = await post(invoice({ items: [{ productId: 7, sourceDocumentItemId: 102, quantity: 1 }] }));
    assert.equal(result.response.status, 201);
    const linkedItems = (createdData?.items as { create: { sourceDocumentItemId: number }[] }).create;
    assert.equal(linkedItems[0]?.sourceDocumentItemId, 102);
    source.items.pop();

    result = await post(invoice({ items: [{ productId: 7, quantity: 6 }] }));
    assert.equal(result.response.status, 409);
    assert.equal(result.body.error, 'La cantidad de la línea de origen 101 supera el saldo pendiente (5)');

    children = [{
      type: DocumentType.FACTURA,
      items: [{ productId: 7, quantity: 3 }],
    }];
    result = await post(invoice({ items: [{ productId: 7, quantity: 3 }] }));
    assert.equal(result.response.status, 409);
    assert.equal(result.body.error, 'La cantidad de la línea de origen 101 supera el saldo pendiente (2)');

    children = [{
      type: DocumentType.REMITO,
      items: [{ productId: 7, quantity: 1 }],
    }];
    result = await post(invoice());
    assert.equal(result.response.status, 409);
    assert.equal(result.body.error, 'La VENTA ya tiene remito; facture desde el REMITO correspondiente');

    children = [{
      type: DocumentType.FACTURA,
      items: [{ productId: 7, quantity: 1 }],
    }];
    result = await post(delivery());
    assert.equal(result.response.status, 409);
    assert.equal(result.body.error, 'La VENTA ya fue facturada directamente y no admite un REMITO posterior');

    children = [{
      type: DocumentType.FACTURA,
      items: [{ productId: 7, quantity: 3 }],
    }];
    events.length = 0;
    createdData = null;
    result = await post(invoice({ items: [{ productId: 7, quantity: 2, unitPrice: 999 }] }));
    assert.equal(result.response.status, 201);
    assert.ok(events.indexOf('lock-source') < events.indexOf('read-source'));
    assert.ok(events.indexOf('read-source') < events.indexOf('read-children'));
    assert.equal(createdData?.clientId, 20);
    assert.equal(createdData?.supplierId, undefined);
    assert.equal(createdData?.branchId, 2);
    assert.equal(createdData?.warehouseId, 3);
    const createdItems = (createdData?.items as { create: { quantity: number; unitPrice: number }[] }).create;
    assert.equal(createdItems[0]?.quantity, 2);
    assert.equal(createdItems[0]?.unitPrice, 100, 'source price must override the request');

    permissions = ['compras.escribir'];
    source = supplierReceipt();
    children = [];
    createdData = null;
    result = await post(invoice({
      direction: 'ingreso',
      sourceDocumentId: 30,
      items: [{ productId: 7, quantity: 1 }],
    }));
    assert.equal(result.response.status, 201);
    assert.equal(createdData?.supplierId, 40);
    assert.equal(createdData?.clientId, undefined);

    // A paid PEDIDO keeps logistics open while persisting its payment evidence.
    permissions = ['ventas.escribir'];
    createdData = null;
    result = await post({
      type: 'PEDIDO', clientId: 20, paymentMethod: 'Efectivo',
      items: [{ productId: 7, quantity: 1 }],
    });
    assert.equal(result.response.status, 201);
    assert.equal(createdData?.status, 'Abierto');
    assert.ok((createdData?.payments as { create?: unknown })?.create);
    source = { ...sale(), type: DocumentType.PEDIDO };
    children = [];
    const paidOrderProgress = await patchStatus('En Proceso');
    assert.equal(paidOrderProgress.status, 200);
    assert.equal(source.status, 'En Proceso');
    source.status = 'Pagado';
    assert.equal((await patchStatus('En Proceso')).status, 200, 'legacy paid PEDIDO can progress');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
    Reflect.deleteProperty(prisma.user, 'findUnique');
    Reflect.deleteProperty(prisma.companySubscription, 'findUnique');
    Reflect.deleteProperty(prisma.document, 'count');
    Reflect.deleteProperty(prisma, '$transaction');
  }
});
