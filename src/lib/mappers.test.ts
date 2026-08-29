import { describe, it, expect } from 'vitest';
import { toFrontProduct, toFrontPurchaseOrder, toFrontPurchaseDocument, toFrontSale } from './mappers';
import type { ApiProduct, ApiDocument } from './mappers';

const sampleProduct: ApiProduct = {
  id: 4,
  internalCode: 'CL-TS-001',
  name: 'Camiseta Básica Algodón',
  description: null,
  salePrice: '19.99',
  costPrice: '8.00',
  category: { name: 'Ropa' },
  tax: { name: 'IVA 16%', rate: 16 },
  stocks: [
    { warehouseId: 1, quantity: '840', minStock: '40' },
    { warehouseId: 2, quantity: '7', minStock: '10' },
  ],
  active: true,
  allowOversell: false,
};

const sampleDocument: ApiDocument = {
  id: 8,
  type: 'VENTA',
  series: 'A',
  number: 8,
  date: '2026-08-28T14:30:00.000Z',
  status: 'Pagado',
  subtotal: '89.50',
  totalTax: '14.32',
  total: '103.82',
  supplier: null,
  client: { id: 1, name: 'Lucas Fernandez', type: 'Retail' },
  payments: [{ id: 1, method: 'Efectivo', status: 'Pagado' }],
  items: [
    { id: 1, productId: 4, description: 'Camiseta Básica Algodón', quantity: '2', unitPrice: '19.99', lineTotal: '39.98' },
    { id: 2, productId: null, description: 'Envío', quantity: '1', unitPrice: '5.00', lineTotal: '5.00' },
  ],
};

describe('toFrontProduct', () => {
  it('sums stock and minStock across warehouses (Prisma Decimal strings)', () => {
    const p = toFrontProduct(sampleProduct);
    expect(p.stock).toBe(847);
    expect(p.minStock).toBe(50);
  });

  it('maps price strings to numbers and keeps tax rate', () => {
    const p = toFrontProduct(sampleProduct);
    expect(p.price).toBe(19.99);
    expect(p.costPrice).toBe(8);
    expect(p.taxRate).toBe(16);
  });

  it('derives status from stock vs min', () => {
    expect(toFrontProduct(sampleProduct).status).toBe('InStock');
    expect(toFrontProduct({ ...sampleProduct, stocks: [{ warehouseId: 1, quantity: '0', minStock: '0' }] }).status).toBe('OutOfStock');
    expect(toFrontProduct({ ...sampleProduct, stocks: [{ warehouseId: 1, quantity: '40', minStock: '50' }] }).status).toBe('LowStock');
  });

  it('falls back for missing category and internalCode', () => {
    const p = toFrontProduct({ ...sampleProduct, category: null, internalCode: null });
    expect(p.category).toBe('Sin categoría');
    expect(p.sku).toBe('');
  });
});

describe('toFrontPurchaseOrder', () => {
  it('maps id, payment status and totals', () => {
    const abierta = toFrontPurchaseOrder(sampleDocument);
    expect(abierta.id).toBe('VENTA-A-0008');
    expect(abierta.total).toBe(103.82);
    expect(abierta.paymentStatus).toBe('Pagado');
  });

  it('maps known receipt statuses (Abierto/Parcial/Recibido) and falls back otherwise', () => {
    expect(toFrontPurchaseOrder({ ...sampleDocument, status: 'Recibido' }).receiptStatus).toBe('Recibido');
    expect(toFrontPurchaseOrder({ ...sampleDocument, status: 'Parcial' }).receiptStatus).toBe('Parcial');
    expect(toFrontPurchaseOrder(sampleDocument).receiptStatus).toBe('Pendiente');
    expect(toFrontPurchaseOrder({ ...sampleDocument, status: 'Abierto' }).receiptStatus).toBe('Pendiente');
    expect(toFrontPurchaseOrder({ ...sampleDocument, status: 'Abierto' }).paymentStatus).toBe('No Pagado');
  });
});

describe('toFrontPurchaseDocument', () => {
  it('builds a display number and maps items with numeric values', () => {
    const d = toFrontPurchaseDocument(sampleDocument);
    expect(d.number).toBe('VENTA A-0008');
    expect(d.items[0].ordered).toBe(2);
    expect(d.items[0].unitPrice).toBe(19.99);
    expect(d.items[0].productId).toBe('4');
    expect(d.items[1].productId).toBe('');
  });
});

describe('toFrontSale', () => {
  it('maps totals, payment and first payment method', () => {
    const s = toFrontSale(sampleDocument);
    expect(s.amount).toBe(103.82);
    expect(s.paymentStatus).toBe('Pagado');
    expect(s.fulfillmentStatus).toBe('Entregado');
    expect(s.paymentMethod).toBe('Efectivo');
    expect(s.itemsCount).toBe(3);
  });

  it('derives New/Pendiente for unpaid documents', () => {
    const s = toFrontSale({ ...sampleDocument, status: 'Abierto', payments: undefined });
    expect(s.paymentStatus).toBe('Pendiente');
    expect(s.fulfillmentStatus).toBe('Nuevo');
    expect(s.paymentMethod).toBe('—');
  });
});