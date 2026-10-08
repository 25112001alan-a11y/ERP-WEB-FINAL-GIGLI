import { test } from 'node:test';
import assert from 'node:assert/strict';
import { veredictoEnviado } from '../src/lib/estadoEnviado.js';

test('Enviado consistente cuando cada línea tiene entregado >= pedido', () => {
  const v = veredictoEnviado({
    pedido: { id: 1, rubros: [{ id: 10, cantidad: 5 }, { id: 11, cantidad: 3 }] },
    remitos: [{ items: [{ sourceDocumentItemId: 10, cantidad: 5 }, { sourceDocumentItemId: 11, cantidad: 3 }] }],
  });
  assert.deepEqual(v, { clase: 'consistente' });
});

test('entregas parciales que suman cubren la línea', () => {
  const v = veredictoEnviado({
    pedido: { id: 1, rubros: [{ id: 10, cantidad: 10 }] },
    remitos: [
      { items: [{ sourceDocumentItemId: 10, cantidad: 4 }] },
      { items: [{ sourceDocumentItemId: 10, cantidad: 6 }] },
    ],
  });
  assert.deepEqual(v, { clase: 'consistente' });
});

test('corto cuando una línea quedó sin entregar del todo', () => {
  const v = veredictoEnviado({
    pedido: { id: 1, rubros: [{ id: 10, cantidad: 5 }] },
    remitos: [{ items: [{ sourceDocumentItemId: 10, cantidad: 4 }] }],
  });
  assert.deepEqual(v, { clase: 'corto', rubros: [{ id: 10, pedido: 5, entregado: 4 }] });
});

test('corto lista solo las líneas faltantes', () => {
  const v = veredictoEnviado({
    pedido: { id: 1, rubros: [{ id: 10, cantidad: 5 }, { id: 11, cantidad: 3 }] },
    remitos: [{ items: [{ sourceDocumentItemId: 10, cantidad: 5 }, { sourceDocumentItemId: 11, cantidad: 1 }] }],
  });
  assert.deepEqual(v, { clase: 'corto', rubros: [{ id: 11, pedido: 3, entregado: 1 }] });
});

test('sin despacho cuando no hay ningún remito derivado', () => {
  const v = veredictoEnviado({ pedido: { id: 1, rubros: [{ id: 10, cantidad: 5 }] }, remitos: [] });
  assert.deepEqual(v, { clase: 'sin_despacho' });
});

test('sin trazabilidad cuando los remitos existen pero sin linaje por línea', () => {
  const v = veredictoEnviado({
    pedido: { id: 1, rubros: [{ id: 10, cantidad: 5 }] },
    remitos: [{ items: [{ sourceDocumentItemId: null, cantidad: 5 }] }],
  });
  assert.deepEqual(v, { clase: 'sin_trazabilidad' });
});