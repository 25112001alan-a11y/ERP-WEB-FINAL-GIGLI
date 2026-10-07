import { describe, expect, it } from 'vitest';
import { canCancelPublicOrder, toFrontPublicOrder, type ApiDocument } from './mappers';

const order = (overrides: Partial<ApiDocument> = {}): ApiDocument => ({
  id: 1,
  type: 'PEDIDO',
  series: 'A',
  number: 2,
  date: '2026-09-30T12:00:00.000Z',
  status: 'Enviado',
  subtotal: 100,
  totalTax: 0,
  total: 100,
  supplier: null,
  client: { id: 3, name: 'Client', type: 'Mayorista' },
  items: [],
  ...overrides,
});

describe('PEDIDO list mapping', () => {
  it('keeps paid evidence when dispatch changes the logistics status', () => {
    const mapped = toFrontPublicOrder(order({
      payments: [{ id: 4, method: 'Efectivo', status: 'Pagado', amount: 100 }],
    }));
    expect(mapped.paymentStatus).toBe('Pagado');
    expect(mapped.logisticsStatus).toBe('Enviado');
  });

  it('keeps a partially dispatched order non-cancellable and a partial payment pending', () => {
    const mapped = toFrontPublicOrder(order({
      status: 'En Proceso',
      hasDispatch: true,
      payments: [{ id: 4, method: 'Efectivo', status: 'Pagado', amount: 40 }],
    }));
    expect(mapped.hasDispatch).toBe(true);
    expect(canCancelPublicOrder(mapped)).toBe(false);
    expect(mapped.logisticsStatus).toBe('En Proceso');
    expect(mapped.paymentStatus).toBe('Pendiente');
  });

  it('preserves legacy status when no payment amounts are available', () => {
    expect(toFrontPublicOrder(order({ status: 'Pagado', payments: [] })).paymentStatus).toBe('Pagado');
    expect(toFrontPublicOrder(order({ status: 'Abierto', payments: [] })).paymentStatus).toBe('Pendiente');
  });
});
