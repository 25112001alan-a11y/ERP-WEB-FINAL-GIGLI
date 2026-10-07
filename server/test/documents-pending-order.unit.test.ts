import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DocumentType } from '@prisma/client';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';

test('document list allocates legacy quantities by source-line ID without reordering rows', async () => {
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
      roles: [{ role: { permissions: [{ permission: { name: 'compras.leer' } }] } }],
    };
  });
  let listQueries = 0;
  let sourceType: DocumentType = DocumentType.OC;
  const findMany = mock.fn(async () => {
    if (++listQueries === 1) {
      return [{
        id: 10,
        type: sourceType,
        items: [
          { id: 102, productId: 7, sourceDocumentItemId: null, quantity: 5 },
          { id: 101, productId: 7, sourceDocumentItemId: null, quantity: 5 },
        ],
      }];
    }
    return [{
      sourceDocumentId: 10,
      type: DocumentType.REMITO,
      items: [
        { sourceDocumentItemId: 101, productId: 7, quantity: 2 },
        { sourceDocumentItemId: null, productId: 7, quantity: 4 },
      ],
    }];
  });

  Object.defineProperty(prisma.user, 'findUnique', { value: userLookup, configurable: true });
  Object.defineProperty(prisma.document, 'findMany', { value: findMany, configurable: true });

  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const token = signToken({ sub: 1, companyId: 1, email: 'buyer@example.test' });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/api/documents?type=OC`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    const documents = await response.json() as {
      items: { id: number; pendingQuantity: number }[];
    }[];
    assert.deepEqual(documents[0]?.items.map(({ id, pendingQuantity }) => ({ id, pendingQuantity })), [
      { id: 102, pendingQuantity: 4 },
      { id: 101, pendingQuantity: 0 },
    ]);
    assert.equal((documents[0] as typeof documents[number] & { hasDispatch: boolean }).hasDispatch, false);
    assert.equal(findMany.mock.callCount(), 2);

    sourceType = DocumentType.PEDIDO;
    listQueries = 0;
    const pedidoResponse = await fetch(`${base}/api/documents?type=PEDIDO`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(pedidoResponse.status, 200);
    const pedidos = await pedidoResponse.json() as (typeof documents[number] & { hasDispatch: boolean })[];
    assert.deepEqual(pedidos[0]?.items.map(({ id, pendingQuantity }) => ({ id, pendingQuantity })), [
      { id: 102, pendingQuantity: 4 },
      { id: 101, pendingQuantity: 0 },
    ]);
    assert.equal(pedidos[0]?.hasDispatch, true, 'a partial REMITO must block cancellation');
    assert.equal(findMany.mock.callCount(), 4);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
    Reflect.deleteProperty(prisma.user, 'findUnique');
    Reflect.deleteProperty(prisma.document, 'findMany');
  }
});
