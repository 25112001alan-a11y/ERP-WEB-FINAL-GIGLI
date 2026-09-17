import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';

let server: Server;
let base: string;
let token: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana.silva@empresa.com', password: 'password123' }),
  });
  const body = await res.json();
  token = body.token;
});

after(() => { server.close(); });

function auth(extra: RequestInit = {}): Record<string, string> {
  return { authorization: `Bearer ${token}`, ...(extra.headers as Record<string, string> ?? {}) };
}

let ocId: number;

test('POST /api/documents — create OC with a valid product', async () => {
  // Fetch the first available product so the test doesn't depend on a fixed ID.
  const prodRes = await fetch(`${base}/api/products`, { headers: auth() });
  const products = await prodRes.json();
  assert.ok(products.length >= 1, 'Need at least one seeded product');
  const productId = products[0].id;

  const res = await fetch(`${base}/api/documents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth() },
    body: JSON.stringify({
      type: 'OC',
      series: 'A',
      supplierName: 'Proveedor Test',
      items: [{ productId, quantity: 2 }],
    }),
  });
  const body = await res.json();
  if (res.status !== 201 || !body.id) {
    console.error('POST /api/documents DEBUG → status:', res.status, 'body:', JSON.stringify(body));
  }
  assert.equal(res.status, 201);
  assert.ok(body.id);
  ocId = body.id;
});

test('PATCH /api/documents/:id/external — persist supplier voucher data', async () => {
  const res = await fetch(`${base}/api/documents/${ocId}/external`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...auth() },
    body: JSON.stringify({
      externalNumber: 'R-9876',
      supplierCuit: '20-30112233-4',
      supplierName: 'Proveedor Test S.A.',
      emissionDate: '2026-09-15T00:00:00.000Z',
      externalSubtotal: 500,
      externalTax: 105,
      externalTotal: 605,
      ingestionMethod: 'manual',
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('GET /api/documents/:id — invoiceData reflects captured voucher', async () => {
  const res = await fetch(`${base}/api/documents/${ocId}`, { headers: auth() });
  assert.equal(res.status, 200);
  const doc = await res.json();
  assert.equal(doc.externalNumber, 'R-9876');
  assert.ok(doc.invoiceData, 'invoiceData must exist');
  assert.equal(doc.invoiceData.supplierCuit, '20-30112233-4');
  assert.equal(doc.invoiceData.supplierName, 'Proveedor Test S.A.');
  assert.equal(doc.invoiceData.ingestionMethod, 'manual');
  assert.equal(Number(doc.invoiceData.externalTotal), 605);
  assert.ok(doc.invoiceData.verifiedBy?.firstName, 'verifiedBy must be set');
});

test('POST /api/documents/:id/external/attach — upload file', async () => {
  const formData = new FormData();
  // Real PDF magic bytes: the server now validates content, not the declared type.
  formData.append(
    'file',
    new Blob(['%PDF-1.4\n% test fixture\n'], { type: 'application/pdf' }),
    'remito.pdf',
  );

  const res = await fetch(`${base}/api/documents/${ocId}/external/attach`, {
    method: 'POST',
    headers: auth(),
    body: formData,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(typeof body.attachmentUrl === 'string');
  assert.ok(body.attachmentUrl.endsWith('.pdf'));
});

test('POST /api/documents/:id/external/attach — rejects spoofed content', async () => {
  const formData = new FormData();
  // Claims to be a PDF but has no %PDF- header: must be rejected.
  formData.append(
    'file',
    new Blob(['not really a pdf'], { type: 'application/pdf' }),
    'fake.pdf',
  );

  const res = await fetch(`${base}/api/documents/${ocId}/external/attach`, {
    method: 'POST',
    headers: auth(),
    body: formData,
  });
  assert.equal(res.status, 400);
});

test('POST /api/documents/:id/external/attach — rejects a disallowed extension', async () => {
  const formData = new FormData();
  formData.append('file', new Blob(['%PDF-1.4\n'], { type: 'application/pdf' }), 'payload.exe');

  const res = await fetch(`${base}/api/documents/${ocId}/external/attach`, {
    method: 'POST',
    headers: auth(),
    body: formData,
  });
  assert.equal(res.status, 400);
});

test('GET /api/documents/:id — attachmentUrl persisted in invoiceData', async () => {
  const res = await fetch(`${base}/api/documents/${ocId}`, { headers: auth() });
  const doc = await res.json();
  assert.ok(doc.invoiceData?.attachmentUrl, 'attachmentUrl must be stored');
  assert.ok(doc.invoiceData.attachmentUrl.startsWith('/uploads/'));
});

test('GET /api/documents/:id/external/attachment — serves the file to the tenant', async () => {
  const res = await fetch(`${base}/api/documents/${ocId}/external/attachment`, { headers: auth() });
  assert.equal(res.status, 200);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.ok(bytes.subarray(0, 5).toString('latin1') === '%PDF-');
});

test('GET /api/documents/:id/external/attachment — requires authentication', async () => {
  const res = await fetch(`${base}/api/documents/${ocId}/external/attachment`);
  assert.equal(res.status, 401);
});
