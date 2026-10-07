import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DocumentType } from '@prisma/client';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';

const KEY_ONE = '65cf9eb2-8ca4-4bde-8311-78b7bd1be9b8';
const KEY_TWO = '5fac8ba3-0840-4d6b-8e38-f8dc5f37b0e9';

function commandFingerprint(body: {
  warehouseId: number;
  items: { productId: number; sourceDocumentItemId?: number; quantity: number }[];
  externalNumber?: string;
  date?: string;
  notes?: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        orderId: 10,
        warehouseId: body.warehouseId,
        items: [...body.items]
          .sort((left, right) => left.productId - right.productId)
          .map((item) => ({
            productId: item.productId,
            sourceDocumentItemId: item.sourceDocumentItemId ?? null,
            quantity: item.quantity,
          })),
        externalNumber: body.externalNumber?.trim() || null,
        date: body.date ? new Date(body.date).toISOString() : null,
        notes: body.notes?.trim() || null,
      }),
    )
    .digest('hex');
}

test('purchase-order receipt enforces validation, idempotency and lock ordering without a database', async () => {
  const userLookup = mock.fn(async (args: { select?: { email?: boolean } }) => {
    if (args.select?.email) {
      return {
        id: 1,
        companyId: 1,
        email: 'buyer@example.test',
        status: 'Activo',
        branchId: null,
        roles: [{ roleId: 1 }],
      };
    }
    return {
      roles: [
        {
          role: {
            permissions: [{ permission: { name: 'compras.escribir' } }],
          },
        },
      ],
    };
  });

  type Receipt = {
    id: number;
    type: DocumentType;
    sourceDocumentId: number;
    receiptFingerprint: string;
    sourceDocument: { status: string };
    items: unknown[];
  };

  let priorReceipt: Receipt | null = null;
  let racedReceipt: Receipt | null = null;
  let orderStatus = 'Abierto';
  let orderItems = [{
    id: 101,
    productId: 7,
    description: 'Producto siete',
    quantity: 5,
    unitPrice: 100,
    taxRate: 21,
  }];
  let receivedDocuments: { items: { sourceDocumentItemId?: number | null; productId: number; quantity: number }[] }[] = [];
  let rawQueryCount = 0;
  const events: string[] = [];
  let createdData: Record<string, unknown> | null = null;

  const rootDocumentLookup = mock.fn(async () => priorReceipt);
  const tx = {
    $queryRaw: mock.fn(async () => {
      rawQueryCount += 1;
      if (rawQueryCount === 1) {
        events.push('lock-oc');
        return [{ id: 10 }];
      }
      events.push('lock-counter');
      return [{ nextNumber: 51 }];
    }),
    $executeRaw: mock.fn(async () => 1),
    document: {
      findFirst: mock.fn(async (args: { where: { id?: number; idempotencyKey?: string } }) => {
        if (args.where.id === 10) {
          events.push('read-oc');
          return {
            id: 10,
            companyId: 1,
            type: DocumentType.OC,
            status: orderStatus,
            supplierId: 4,
            branchId: 2,
            warehouseId: 3,
            number: 20,
            items: orderItems,
          };
        }
        events.push('read-idempotency-after-lock');
        return racedReceipt;
      }),
      findMany: mock.fn(async () => {
        events.push('read-received-balances');
        return receivedDocuments;
      }),
      create: mock.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push('create-remito');
        createdData = data;
        return { id: 55, number: 51, items: [] };
      }),
      update: mock.fn(async () => ({ id: 10 })),
    },
    warehouse: {
      findFirst: mock.fn(async () => ({ id: 3, companyId: 1, branchId: 2 })),
    },
    // Master rows the header snapshot freezes at creation time.
    company: {
      findUnique: mock.fn(async () => ({ legalName: 'Nexus Demo SA', taxId: '30-99999999-9' })),
    },
    branch: {
      findFirst: mock.fn(async () => ({ id: 2, name: 'Sucursal Central', address: 'Av. Siempreviva 100' })),
    },
    supplier: {
      findFirst: mock.fn(async () => ({ id: 4, name: 'Proveedor Demo S.A.', taxId: '30-44444444-4' })),
    },
    product: {
      findFirst: mock.fn(async () => ({
        id: 7,
        name: 'Producto siete',
        costPrice: 100,
        tax: { rate: 21 },
      })),
    },
    stock: {
      upsert: mock.fn(async () => ({ productId: 7, warehouseId: 3 })),
    },
    stockMovement: {
      create: mock.fn(async () => ({ id: 91 })),
    },
    auditLog: {
      create: mock.fn(async () => ({ id: 92 })),
    },
  };
  const transaction = mock.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );

  Object.defineProperty(prisma.user, 'findUnique', { value: userLookup, configurable: true });
  Object.defineProperty(prisma.document, 'findFirst', {
    value: rootDocumentLookup,
    configurable: true,
  });
  Object.defineProperty(prisma, '$transaction', { value: transaction, configurable: true });

  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const token = signToken({ sub: 1, companyId: 1, email: 'buyer@example.test' });
    const receive = (body: Record<string, unknown>, orderId = 10) =>
      fetch(`${base}/api/documents/${orderId}/receive`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    const validBody = {
      idempotencyKey: KEY_ONE,
      warehouseId: 3,
      items: [{ productId: 7, quantity: 2 }],
    };

    const transactionCountBeforeValidation = transaction.mock.callCount();
    const lookupCountBeforeValidation = rootDocumentLookup.mock.callCount();
    const missingKey = await receive({ warehouseId: 3, items: validBody.items });
    assert.equal(missingKey.status, 400);
    const invalidKey = await receive({ ...validBody, idempotencyKey: 'retry-1' });
    assert.equal(invalidKey.status, 400);
    const duplicateProducts = await receive({
      ...validBody,
      items: [
        { productId: 7, quantity: 2 },
        { productId: 7, quantity: 3 },
      ],
    });
    assert.equal(duplicateProducts.status, 400);
    assert.deepEqual(await duplicateProducts.json(), {
      error: 'No se puede repetir el mismo producto en una recepción',
    });
    assert.equal(transaction.mock.callCount(), transactionCountBeforeValidation);
    assert.equal(rootDocumentLookup.mock.callCount(), lookupCountBeforeValidation);

    priorReceipt = {
      id: 70,
      type: DocumentType.REMITO,
      sourceDocumentId: 99,
      receiptFingerprint: commandFingerprint(validBody),
      sourceDocument: { status: 'Parcial' },
      items: [],
    };
    const transactionCountBeforeConflict = transaction.mock.callCount();
    const conflictingKey = await receive(validBody);
    assert.equal(conflictingKey.status, 409);
    assert.deepEqual(await conflictingKey.json(), {
      error: 'La clave de reintento ya fue usada en otra operación',
    });
    assert.equal(transaction.mock.callCount(), transactionCountBeforeConflict);

    priorReceipt = {
      id: 71,
      type: DocumentType.REMITO,
      sourceDocumentId: 10,
      receiptFingerprint: commandFingerprint({
        ...validBody,
        items: [{ productId: 7, quantity: 1 }],
      }),
      sourceDocument: { status: 'Parcial' },
      items: [],
    };
    const transactionCountBeforePayloadConflict = transaction.mock.callCount();
    const stockCountBeforePayloadConflict = tx.stock.upsert.mock.callCount();
    const payloadConflict = await receive(validBody);
    assert.equal(payloadConflict.status, 409);
    assert.deepEqual(await payloadConflict.json(), {
      error: 'La clave de reintento corresponde a una recepción con datos diferentes',
    });
    assert.equal(transaction.mock.callCount(), transactionCountBeforePayloadConflict);
    assert.equal(tx.stock.upsert.mock.callCount(), stockCountBeforePayloadConflict);

    priorReceipt = {
      id: 71,
      type: DocumentType.REMITO,
      sourceDocumentId: 10,
      receiptFingerprint: commandFingerprint(validBody),
      sourceDocument: { status: 'Parcial' },
      items: [],
    };
    const transactionCountBeforeReplay = transaction.mock.callCount();
    const stockCountBeforeReplay = tx.stock.upsert.mock.callCount();
    const auditCountBeforeReplay = tx.auditLog.create.mock.callCount();
    const replay = await receive(validBody);
    assert.equal(replay.status, 200);
    const replayBody = await replay.json();
    assert.equal(replayBody.replayed, true);
    assert.equal(replayBody.document.id, 71);
    assert.equal(transaction.mock.callCount(), transactionCountBeforeReplay);
    assert.equal(tx.stock.upsert.mock.callCount(), stockCountBeforeReplay);
    assert.equal(tx.auditLog.create.mock.callCount(), auditCountBeforeReplay);

    priorReceipt = null;
    racedReceipt = null;
    orderStatus = 'Abierto';
    rawQueryCount = 0;
    events.length = 0;
    const createdCountBefore = tx.document.create.mock.callCount();
    const success = await receive(validBody);
    assert.equal(success.status, 201);
    const successBody = await success.json();
    assert.equal(successBody.replayed, false);
    assert.equal(successBody.document.id, 55);
    assert.equal(tx.document.create.mock.callCount(), createdCountBefore + 1);
    assert.equal(createdData?.idempotencyKey, KEY_ONE);
    assert.equal(createdData?.receiptFingerprint, commandFingerprint(validBody));
    assert.equal(createdData?.supplierId, 4);
    assert.equal(createdData?.warehouseId, 3);
    assert.ok(events.indexOf('lock-oc') < events.indexOf('read-oc'));
    assert.ok(events.indexOf('read-oc') < events.indexOf('read-idempotency-after-lock'));
    assert.ok(
      events.indexOf('read-idempotency-after-lock') < events.indexOf('read-received-balances'),
    );

    // A prior linked receipt of the first duplicate-product OC line must not
    // reduce the independent pending balance of the second line.
    orderStatus = 'Parcial';
    orderItems = [
      { id: 110, productId: 7, description: 'Producto siete - lote 1', quantity: 5, unitPrice: 100, taxRate: 21 },
      { id: 111, productId: 7, description: 'Producto siete - lote 2', quantity: 3, unitPrice: 100, taxRate: 21 },
    ];
    receivedDocuments = [{ items: [{ sourceDocumentItemId: 110, productId: 7, quantity: 5 }] }];
    rawQueryCount = 0;
    const duplicateLinePartial = await receive({
      idempotencyKey: KEY_TWO,
      warehouseId: 3,
      items: [{ productId: 7, sourceDocumentItemId: 111, quantity: 3 }],
    });
    assert.equal(duplicateLinePartial.status, 201);
    const duplicateLineBody = await duplicateLinePartial.json();
    assert.equal(duplicateLineBody.replayed, false);
    const linkedReceiptItems = (createdData?.items as { create: { sourceDocumentItemId: number }[] }).create;
    assert.equal(linkedReceiptItems[0]?.sourceDocumentItemId, 111);
    receivedDocuments = [];

    rawQueryCount = 0;
    events.length = 0;
    const createCountBeforeWrongWarehouse = tx.document.create.mock.callCount();
    const wrongWarehouse = await receive({
      ...validBody,
      idempotencyKey: KEY_TWO,
      warehouseId: 4,
    });
    assert.equal(wrongWarehouse.status, 409);
    assert.deepEqual(await wrongWarehouse.json(), {
      error: 'La recepción debe ingresar al depósito de la orden',
    });
    assert.equal(tx.document.create.mock.callCount(), createCountBeforeWrongWarehouse);

    rawQueryCount = 0;
    events.length = 0;
    racedReceipt = {
      id: 72,
      type: DocumentType.REMITO,
      sourceDocumentId: 10,
      receiptFingerprint: commandFingerprint({ ...validBody, idempotencyKey: KEY_TWO }),
      sourceDocument: { status: 'Parcial' },
      items: [],
    };
    const stockCountBeforeRacedReplay = tx.stock.upsert.mock.callCount();
    const createCountBeforeRacedReplay = tx.document.create.mock.callCount();
    const racedReplay = await receive({ ...validBody, idempotencyKey: KEY_TWO });
    assert.equal(racedReplay.status, 200);
    assert.equal((await racedReplay.json()).replayed, true);
    assert.equal(events[0], 'lock-oc');
    assert.equal(tx.stock.upsert.mock.callCount(), stockCountBeforeRacedReplay);
    assert.equal(tx.document.create.mock.callCount(), createCountBeforeRacedReplay);

    racedReceipt = null;
    orderStatus = 'Recibido';
    rawQueryCount = 0;
    const createCountBeforeCompletedOrder = tx.document.create.mock.callCount();
    const completedOrder = await receive({ ...validBody, idempotencyKey: KEY_TWO });
    assert.equal(completedOrder.status, 409);
    assert.deepEqual(await completedOrder.json(), {
      error: 'La orden ya fue recibida completamente',
    });
    assert.equal(tx.document.create.mock.callCount(), createCountBeforeCompletedOrder);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    Reflect.deleteProperty(prisma.user, 'findUnique');
    Reflect.deleteProperty(prisma.document, 'findFirst');
    Reflect.deleteProperty(prisma, '$transaction');
  }
});
