import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoHechoEconomico } from '../src/lib/proyeccion.js';

const ANCESTROS = new Map([
  [1, { type: 'VENTA', sourceDocumentId: null }],
  [2, { type: 'REMITO', sourceDocumentId: 1 }],
  [3, { type: 'PEDIDO', sourceDocumentId: null }],
  [4, { type: 'REMITO', sourceDocumentId: 3 }],
  [5, { type: 'COMPRA', sourceDocumentId: null }],
  [6, { type: 'REMITO', sourceDocumentId: 5 }],
  [7, { type: 'OC', sourceDocumentId: null }],
]);

const DOC = (type: string, over: Partial<{ clientId: number | null; supplierId: number | null; sourceDocumentId: number | null }> = {}) => ({
  type,
  clientId: over.clientId ?? null,
  supplierId: over.supplierId ?? null,
  sourceDocumentId: over.sourceDocumentId ?? null,
});

test('VENTA y COMPRA son hechos económicos directos', () => {
  assert.equal(tipoHechoEconomico(DOC('VENTA'), ANCESTROS), 'ingreso');
  assert.equal(tipoHechoEconomico(DOC('COMPRA'), ANCESTROS), 'egreso');
});

test('OC, PEDIDO y REMITO nunca son hechos económicos', () => {
  assert.equal(tipoHechoEconomico(DOC('OC'), ANCESTROS), null);
  assert.equal(tipoHechoEconomico(DOC('PEDIDO'), ANCESTROS), null);
  assert.equal(tipoHechoEconomico(DOC('REMITO'), ANCESTROS), null);
  assert.equal(tipoHechoEconomico(DOC('COTIZACION'), ANCESTROS), null);
});

test('factura de cliente con VENTA ancestro no se vuelve a contar', () => {
  assert.equal(tipoHechoEconomico(DOC('FACTURA', { clientId: 1, sourceDocumentId: 1 }), ANCESTROS), null);
});

test('factura de cliente derivada de remito de VENTA no se vuelve a contar', () => {
  assert.equal(tipoHechoEconomico(DOC('FACTURA', { clientId: 1, sourceDocumentId: 2 }), ANCESTROS), null);
});

test('factura de cliente sin VENTA ancestro se reconoce como ingreso (venta diferida)', () => {
  assert.equal(tipoHechoEconomico(DOC('FACTURA', { clientId: 1, sourceDocumentId: 4 }), ANCESTROS), 'ingreso');
  assert.equal(tipoHechoEconomico(DOC('FACTURA', { clientId: 1, sourceDocumentId: null }), ANCESTROS), 'ingreso');
});

test('factura de proveedor con COMPRA ancestro no se vuelve a contar', () => {
  assert.equal(tipoHechoEconomico(DOC('FACTURA', { supplierId: 9, sourceDocumentId: 6 }), ANCESTROS), null);
});

test('factura de proveedor sin COMPRA ancestro se reconoce como egreso', () => {
  assert.equal(tipoHechoEconomico(DOC('FACTURA', { supplierId: 9, sourceDocumentId: 7 }), ANCESTROS), 'egreso');
});

test('factura sin contraparte no es hecho económico', () => {
  assert.equal(tipoHechoEconomico(DOC('FACTURA'), ANCESTROS), null);
});

test('linaje con ciclo no cuelga el recorrido', () => {
  const ciclico = new Map([
    [10, { type: 'FACTURA', sourceDocumentId: 11 }],
    [11, { type: 'REMITO', sourceDocumentId: 10 }],
  ]);
  assert.equal(tipoHechoEconomico(DOC('FACTURA', { clientId: 1, sourceDocumentId: 11 }), ciclico), 'ingreso');
});