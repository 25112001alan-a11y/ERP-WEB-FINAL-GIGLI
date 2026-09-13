import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Opt-in integration test: proves the OC -> REMITO -> FACTURA chain against a
// live seeded database. Run with: $env:RUN_CHAIN_TESTS='1'; npm test
// The test cleans up every document it creates and restores stock.
const RUN = process.env.RUN_CHAIN_TESTS === '1';

let server: Server;
let base: string;

before(async () => {
  if (!RUN) return;
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (RUN) server.close();
});

async function api(path: string, options: RequestInit = {}, token?: string) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

interface ChainArtifacts {
  ocId: number;
  remitoId: number;
  facturaId: number;
  productId: number;
  warehouseId: number;
  receivedQty: number;
}

const createdChains: ChainArtifacts[] = [];

test('chain: OC -> receive (REMITO) -> FACTURA', { skip: !RUN }, async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  assert.equal(login.status, 200, 'seed login works');
  const token = login.body.token as string;

  // Catalog + warehouse lookup for assertion/cleanup.
  const products = await api('/api/products', {}, token);
  const product = (products.body as Record<string, any>[]).find(
    (p) => p.internalCode === 'EL-LP-001',
  );
  assert.ok(product, 'seeded product EL-LP-001 exists');
  const productId = product.id as number;
  const warehouseId = (product.stocks[0]?.warehouseId ?? 0) as number;
  assert.ok(warehouseId, 'product has a warehouse');
  const stockBefore = Number(product.stocks[0]?.quantity ?? 0);

  const suppliers = await api('/api/suppliers', {}, token);
  const supplierId = (suppliers.body as { id: number }[])[0]?.id as number | undefined;
  assert.ok(supplierId, 'seeded supplier exists');

  // 1) Open a purchase order.
  const oc = await api(
    '/api/documents',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'OC',
        series: 'A',
        supplierId,
        items: [{ productId, quantity: 2, unitPrice: 850 }],
      }),
    },
    token,
  );
  assert.equal(oc.status, 201, `OC created: ${JSON.stringify(oc.body)}`);
  const ocId = (oc.body as { id: number }).id;

  // 2) Receive against it: creates REMITO with an ENTRADA movement.
  const receive = await api(
    `/api/documents/${ocId}/receive`,
    {
      method: 'POST',
      body: JSON.stringify({
        items: [{ productId, quantity: 2 }],
        warehouseId,
        externalNumber: 'R-TEST-001',
        date: new Date().toISOString(),
      }),
    },
    token,
  );
  assert.equal(receive.status, 201, `receive ok: ${JSON.stringify(receive.body)}`);
  const remito = receive.body.document as {
    id: number;
    type: string;
    status: string;
    externalNumber: string | null;
    sourceDocumentId: number | null;
  };
  assert.equal(remito.type, 'REMITO', 'receive creates a REMITO, not a COMPRA');
  assert.equal(remito.status, 'Recibido');
  assert.equal(remito.externalNumber, 'R-TEST-001');
  assert.equal(remito.sourceDocumentId, ocId);
  assert.equal(receive.body.ocStatus, 'Recibido', 'OC completes after full receipt');

  // Stock moved exactly once with the receipt.
  const productsAfter = await api('/api/products', {}, token);
  const productAfter = (productsAfter.body as Record<string, any>[]).find(
    (p) => p.id === productId,
  );
  assert.equal(
    Number(productAfter.stocks[0]?.quantity ?? 0),
    stockBefore + 2,
    'stock incremented by received quantity',
  );

  // 3) Register the supplier invoice chained to the REMITO.
  const factura = await api(
    '/api/documents',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'FACTURA',
        series: 'A',
        supplierId,
        sourceDocumentId: remito.id,
        externalNumber: '0004-99999999',
        invoice: {
          invoiceType: 'A',
          cae: '70123456789654',
          caeDueDate: new Date().toISOString(),
          puntoVenta: 4,
        },
        paymentMethod: 'Transferencia',
        items: [{ productId, quantity: 2, unitPrice: 850 }],
      }),
    },
    token,
  );
  assert.equal(factura.status, 201, `factura ok: ${JSON.stringify(factura.body)}`);
  const facturaBody = factura.body as {
    id: number;
    type: string;
    status: string;
    sourceDocumentId: number | null;
    invoiceData: { invoiceType: string; cae: string } | null;
    payments: { method: string; status: string }[];
  };
  assert.equal(facturaBody.type, 'FACTURA');
  assert.equal(facturaBody.status, 'Pagado', 'FACTURA with a payment is Pagado');
  assert.equal(facturaBody.sourceDocumentId, remito.id);
  assert.equal(facturaBody.invoiceData?.invoiceType, 'A');
  assert.equal(facturaBody.payments?.[0]?.status, 'Pagado');

  // 4) Documents list surfaces both new docs.
  const remitos = await api('/api/documents?type=REMITO', {}, token);
  assert.ok(
    (remitos.body as { id: number }[]).some((d) => d.id === remito.id),
    'REMITO visible in the list',
  );
  const facturas = await api('/api/documents?type=FACTURA', {}, token);
  assert.ok(
    (facturas.body as { id: number }[]).some((d) => d.id === facturaBody.id),
    'FACTURA visible in the list',
  );

  // Register artifacts for teardown.
  createdChains.push({
    ocId,
    remitoId: remito.id,
    facturaId: facturaBody.id,
    productId,
    warehouseId,
    receivedQty: 2,
  });
});

after(async () => {
  if (!RUN) return;
  // Undo the test: reverse the ENTRADA movement and delete the created chain.
  for (const a of createdChains) {
    await prisma.payment.deleteMany({ where: { documentId: a.facturaId } });
    await prisma.invoiceData.deleteMany({ where: { documentId: a.facturaId } });
    await prisma.documentItem.deleteMany({
      where: { documentId: { in: [a.ocId, a.remitoId, a.facturaId] } },
    });
    await prisma.stockMovement.deleteMany({
      where: { documentId: { in: [a.ocId, a.remitoId, a.facturaId] } },
    });
    const stock = await prisma.stock.findUnique({
      where: { productId_warehouseId: { productId: a.productId, warehouseId: a.warehouseId } },
    });
    if (stock) {
      await prisma.stock.update({
        where: { id: stock.id },
        data: { quantity: { decrement: a.receivedQty } },
      });
    }
    await prisma.document.deleteMany({ where: { id: { in: [a.ocId, a.remitoId, a.facturaId] } } });
  }
});