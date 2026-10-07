import { describe, expect, it } from 'vitest';
import type { ApiDocument } from './mappers';
import {
  deliverySourceDocuments,
  derivedCounterparty,
  derivedDocumentLines,
  invoiceSourceDocuments,
  resolveSourceSelection,
} from './documentDerivation';

function document(
  id: number,
  type: string,
  party: 'client' | 'supplier' | 'none',
  overrides: Partial<ApiDocument> = {},
): ApiDocument {
  return {
    id,
    type,
    series: 'A',
    number: id,
    date: '2026-09-29T12:00:00.000Z',
    status: 'Abierto',
    subtotal: 100,
    totalTax: 21,
    total: 121,
    supplier: party === 'supplier' ? { id: 40, name: 'Proveedor' } : null,
    client: party === 'client' ? { id: 20, name: 'Cliente', type: 'Retail' } : null,
    items: [{
      id: id * 10,
      productId: 7,
      description: 'Producto siete',
      quantity: 2,
      unitPrice: 50,
      lineTotal: 100,
    }],
    ...overrides,
  };
}

describe('document derivation', () => {
  it('offers only sources compatible with invoice direction and branch history', () => {
    const venta = document(1, 'VENTA', 'client');
    const ventaWithDelivery = document(2, 'VENTA', 'client');
    const clientDelivery = document(3, 'REMITO', 'client', { sourceDocumentId: 2 });
    const clientInvoice = document(4, 'FACTURA', 'client', { sourceDocumentId: 1 });
    const supplierDelivery = document(5, 'REMITO', 'supplier');
    const cancelledDelivery = document(6, 'REMITO', 'supplier', { status: 'Anulado' });
    const docs = [venta, ventaWithDelivery, clientDelivery, clientInvoice, supplierDelivery];

    expect(invoiceSourceDocuments('ingreso', docs, [supplierDelivery, clientDelivery, cancelledDelivery]))
      .toEqual([supplierDelivery]);
    expect(invoiceSourceDocuments('egreso', docs, [supplierDelivery]))
      .toEqual([venta, clientDelivery]);
  });

  it('offers only active client sales that have not been directly invoiced for delivery', () => {
    const available = document(1, 'VENTA', 'client');
    const invoiced = document(2, 'VENTA', 'client');
    const directInvoice = document(3, 'FACTURA', 'client', { sourceDocumentId: 2 });
    const cancelled = document(4, 'VENTA', 'client', { status: 'Cancelado' });
    const missingClient = document(5, 'VENTA', 'none');

    expect(deliverySourceDocuments([available, invoiced, directInvoice, cancelled, missingClient]))
      .toEqual([available]);
  });

  it('offers pending orders for deferred dispatch but hides fully delivered orders', () => {
    const pending = document(6, 'PEDIDO', 'client', {
      items: [{ id: 60, productId: 7, description: 'Product', quantity: 5, unitPrice: 10, lineTotal: 50, pendingQuantity: 2 }],
    });
    const delivered = document(7, 'PEDIDO', 'client', {
      items: [{ id: 70, productId: 7, description: 'Product', quantity: 5, unitPrice: 10, lineTotal: 50, pendingQuantity: 0 }],
    });
    expect(deliverySourceDocuments([pending, delivered])).toEqual([pending]);
  });

  it('replaces counterpart data with the selected source identity', () => {
    const supplierSource = document(1, 'REMITO', 'supplier');
    const clientSource = document(2, 'VENTA', 'client');

    expect(derivedCounterparty(supplierSource, 'ingreso')).toEqual({
      supplierId: '40',
      clientName: '',
    });
    expect(derivedCounterparty(clientSource, 'egreso')).toEqual({
      supplierId: '',
      clientName: 'Cliente',
    });
    expect(derivedCounterparty(undefined, 'egreso')).toEqual({
      supplierId: '',
      clientName: '',
    });
  });

  it('marks a previously selected source stale when it leaves the eligible list', () => {
    const source = document(9, 'VENTA', 'client');

    expect(resolveSourceSelection('9', [source])).toEqual({ state: 'valid', source });
    expect(resolveSourceSelection('9', [])).toEqual({ state: 'stale', source: undefined });
    expect(resolveSourceSelection('', [])).toEqual({ state: 'none', source: undefined });
  });

  it('keeps repeated source-product lines separate with their own pending balances', () => {
    const source = document(1, 'VENTA', 'client', {
      items: [
        { id: 1, productId: 7, description: 'Línea uno', quantity: 2, unitPrice: 50, lineTotal: 100, pendingQuantity: 0.5 },
        { id: 2, productId: 7, description: 'Línea dos', quantity: 1, unitPrice: 80, lineTotal: 80, pendingQuantity: 1 },
      ],
    });

    expect(derivedDocumentLines(source).map((line) => ({
      sourceDocumentItemId: line.sourceDocumentItemId,
      originalQuantity: line.originalQuantity,
      quantity: line.quantity,
      maxQuantity: line.maxQuantity,
      unitPrice: line.unitPrice,
    }))).toEqual([
      { sourceDocumentItemId: 1, originalQuantity: 2, quantity: 0.5, maxQuantity: 0.5, unitPrice: 50 },
      { sourceDocumentItemId: 2, originalQuantity: 1, quantity: 1, maxQuantity: 1, unitPrice: 80 },
    ]);
  });
});
