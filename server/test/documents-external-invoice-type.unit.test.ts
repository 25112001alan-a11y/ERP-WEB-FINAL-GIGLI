import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DocumentType } from '@prisma/client';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/lib/jwt.js';

// The external capture derives the invoice letter from the supplier master
// instead of hardcoding 'X' for every FACTURA.
test('PATCH /:id/external derives invoiceType from the supplier master without a database', async () => {
  const upserts: Record<string, unknown>[] = [];

  const tx = {
    document: {
      findFirst: mock.fn(async ({ where }: { where: { id: number } }) => {
        if (where.id === 5) return { id: 5, type: DocumentType.FACTURA, supplierId: 4, externalNumber: null };
        return { id: 6, type: DocumentType.FACTURA, supplierId: 8, externalNumber: null };
      }),
      update: mock.fn(async () => ({ id: 5 })),
    },
    invoiceData: { findUnique: mock.fn(async () => null) },
    supplier: {
      findFirst: mock.fn(async ({ where }: { where: { id: number } }) => (where.id === 4
        ? { id: 4, taxCondition: 'Responsable Inscripto' }
        : { id: 8, taxCondition: null })),
    },
    invoiceData2: undefined,
    auditLog: { create: mock.fn(async () => ({ id: 92 })) },
  };
  tx.invoiceData2 = { upsert: mock.fn(async ({ create }: { create: Record<string, unknown> }) => {
    upserts.push(create); return { id: 9 };
  }) };
  Object.defineProperty(tx, 'invoiceData', { value: { findUnique: tx.invoiceData.findUnique, upsert: tx.invoiceData2.upsert }, configurable: true });

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
  Object.defineProperty(prisma, '$transaction', {
    value: mock.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    configurable: true,
  });

  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const headers = {
      authorization: `Bearer ${signToken({ sub: 1, companyId: 1, email: 'buyer@example.test' })}`,
      'content-type': 'application/json',
    };
    const body = JSON.stringify({ externalNumber: 'R-1000' });

    const responsable = await fetch(`${base}/api/documents/5/external`, { method: 'PATCH', headers, body });
    assert.equal(responsable.status, 200);
    assert.equal(upserts[0]?.invoiceType, 'A', 'Responsable Inscripto mapea a factura A');

    const sinMaestro = await fetch(`${base}/api/documents/6/external`, { method: 'PATCH', headers, body });
    assert.equal(sinMaestro.status, 200);
    assert.equal(upserts[1]?.invoiceType, 'X', 'sin condicion fiscal del maestro cae al comprobante simulado');
    assert.equal(upserts[1]?.confirmedAt instanceof Date, true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    Reflect.deleteProperty(prisma.user, 'findUnique');
    Reflect.deleteProperty(prisma, '$transaction');
  }
});