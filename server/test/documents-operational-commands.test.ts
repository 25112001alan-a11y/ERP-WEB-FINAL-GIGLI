import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// F1.4: los comandos operativos (dispatch, invoice) son la autoridad para los
// documentos derivados; el POST genérico queda limitado a borradores.
let server: Server;
let base: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
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

test('dispatch e invoice son la autoridad; el POST genérico no deriva', async () => {
  // Tenant demo "Kiosco Lo de Marta": se siembra con 2 comprobantes del mes, lejos
  // del cupo de 20 del plan Gratuito. La empresa 14 (ana.silva) ya lo superó en
  // la dev DB y todo POST 402a antes de llegar a estas restricciones.
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dueno@lodemarta.test', password: 'password123' }),
  });
  assert.equal(login.status, 200);
  const token = login.body.token as string;

  const products = (await api('/api/products', {}, token)).body as {
    id: number;
    stocks: { warehouseId: number; quantity: number }[];
  }[];
  const product = products.find((p) => p.stocks.some((s) => Number(s.quantity) >= 1));
  assert.ok(product, 'seed product with stock exists');
  const stocked = product.stocks.find((s) => Number(s.quantity) >= 1)!;
  assert.ok(stocked.warehouseId, 'product has a warehouse');
  const originalQuantity = Number(stocked.quantity);
  const clients = (await api('/api/clients', {}, token)).body as { id: number }[];
  assert.ok(clients[0], 'seed client exists');
  const suppliers = (await api('/api/suppliers', {}, token)).body as { id: number }[];
  assert.ok(suppliers[0], 'seed supplier exists');

  const ids: number[] = [];
  try {
    // El POST genérico no puede crear un REMITO en ningún caso.
    const remito = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'REMITO',
          direction: 'egreso',
          series: 'A',
          clientId: clients[0].id,
          items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
        }),
      },
      token,
    );
    assert.equal(remito.status, 409, JSON.stringify(remito.body));

    // Borradores compatibles siguen por el POST genérico (PEDIDO es aceptado).
    const pedido = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'PEDIDO',
          series: 'PF14',
          clientId: clients[0].id,
          items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
        }),
      },
      token,
    );
    assert.equal(pedido.status, 201, JSON.stringify(pedido.body));
    const pedidoId = pedido.body.id as number;
    ids.push(pedidoId);

    // ...pero no puede derivar una FACTURA de él (eso es /:id/invoice).
    const derivada = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'FACTURA',
          series: 'A',
          sourceDocumentId: pedidoId,
          clientId: clients[0].id,
          invoice: { invoiceType: 'A', cae: '70123456789654', caeDueDate: new Date().toISOString() },
          items: [{ productId: product.id, quantity: 1 }],
        }),
      },
      token,
    );
    assert.equal(derivada.status, 409, JSON.stringify(derivada.body));

    // dispatch solo despacha VENTA o PEDIDO; una OC se rechaza con 400.
    const oc = await api(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'OC',
          series: 'OF14',
          supplierId: suppliers[0].id,
          items: [{ productId: product.id, quantity: 1, unitPrice: 5 }],
        }),
      },
      token,
    );
    assert.equal(oc.status, 201, JSON.stringify(oc.body));
    const ocId = oc.body.id as number;
    ids.push(ocId);
    const ocDispatch = await api(
      `/api/documents/${oc.body.id as number}/dispatch`,
      { method: 'POST', body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }] }) },
      token,
    );
    assert.equal(ocDispatch.status, 400, JSON.stringify(ocDispatch.body));

    // invoice infiere la dirección de la contraparte del origen. Un PEDIDO no
    // se factura directo: el modelo exige el flujo PEDIDO -> REMITO -> FACTURA.
    const pedidoInvoice = await api(
      `/api/documents/${pedidoId}/invoice`,
      {
        method: 'POST',
        body: JSON.stringify({
          series: 'A',
          items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
          invoice: { invoiceType: 'A', cae: '70123456789654', caeDueDate: new Date().toISOString() },
        }),
      },
      token,
    );
    assert.equal(pedidoInvoice.status, 400, JSON.stringify(pedidoInvoice.body));

    // dispatch despacha el PEDIDO: fija tipo/dirección/origen desde la ruta.
    const dispatch = await api(
      `/api/documents/${pedidoId}/dispatch`,
      {
        method: 'POST',
        body: JSON.stringify({
          warehouseId: stocked.warehouseId,
          items: [{ productId: product.id, quantity: 1 }],
        }),
      },
      token,
    );
    assert.equal(dispatch.status, 201, JSON.stringify(dispatch.body));
    assert.equal(dispatch.body.type, 'REMITO');
    assert.equal(dispatch.body.sourceDocumentId, pedidoId);
    ids.push(dispatch.body.id as number);

    // invoice sobre el REMITO devuelve la FACTURA chained y hereda la contraparte.
    const invoice = await api(
      `/api/documents/${dispatch.body.id as number}/invoice`,
      {
        method: 'POST',
        body: JSON.stringify({
          series: 'A',
          items: [{ productId: product.id, quantity: 1 }],
          invoice: { invoiceType: 'A', cae: '70123456789654', caeDueDate: new Date().toISOString() },
        }),
      },
      token,
    );
    assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
    assert.equal(invoice.body.type, 'FACTURA');
    assert.equal(invoice.body.sourceDocumentId, dispatch.body.id, 'chained al REMITO');
    assert.equal(invoice.body.clientId, clients[0].id, 'contraparte heredada del origen');
    ids.push(invoice.body.id as number);
  } finally {
    // Hijos primero (FK restrict): movimientos y pagos, luego invoiceData y los
    // comprobantes (REMITO y FACTURA antes que el PEDIDO origen).
    await prisma.stockMovement.deleteMany({ where: { documentId: { in: ids } } }).catch(() => undefined);
    await prisma.payment.deleteMany({ where: { documentId: { in: ids } } }).catch(() => undefined);
    await prisma.invoiceData.deleteMany({ where: { documentId: { in: ids } } }).catch(() => undefined);
    await prisma.document.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    // Restaura el stock a su saldo exacto previo al test.
    await prisma.stock
      .update({ where: { productId_warehouseId: { productId: product.id, warehouseId: stocked.warehouseId } }, data: { quantity: originalQuantity } })
      .catch(() => undefined);
  }
});
