import type { Product, PurchaseOrder, PurchaseDocument, SaleTransaction } from '../types';

export interface ApiProduct {
  id: number;
  internalCode: string | null;
  name: string;
  description: string | null;
  salePrice: string | number;
  costPrice: string | number;
  category: { name: string } | null;
  tax: { name: string; rate: number };
  stocks: { warehouseId: number; quantity: string | number; minStock: string | number }[];
  active: boolean;
  allowOversell: boolean;
}

export interface ApiDocument {
  id: number;
  type: string;
  series: string;
  number: number;
  date: string;
  status: string;
  subtotal: string | number;
  totalTax: string | number;
  total: string | number;
  supplier: { id: number; name: string } | null;
  client: { id: number; name: string; type: string | null } | null;
  payments?: { id: number; method: string; status: string }[];
  items: {
    id: number;
    productId: number | null;
    description: string;
    quantity: string | number;
    unitPrice: string | number;
    lineTotal: string | number;
  }[];
}

/** Inclusive stock status: out when nothing remains, low when at/below minimum. */
export function toFrontProduct(p: ApiProduct): Product {
  const totalStock = p.stocks.reduce((acc, s) => acc + Number(s.quantity), 0);
  const minStock = p.stocks.reduce((acc, s) => acc + Number(s.minStock), 0);
  const status: Product['status'] =
    totalStock <= 0 ? 'OutOfStock' : totalStock <= minStock ? 'LowStock' : 'InStock';
  return {
    id: String(p.id),
    sku: p.internalCode ?? '',
    name: p.name,
    category: p.category?.name ?? 'Sin categoría',
    stock: totalStock,
    minStock,
    price: Number(p.salePrice),
    costPrice: Number(p.costPrice),
    taxRate: p.tax.rate,
    status,
    active: p.active,
    allowOversell: p.allowOversell,
    warehouse: '',
    description: p.description ?? undefined,
  };
}

const RECEIPT_STATUS: Record<string, PurchaseOrder['receiptStatus']> = {
  Abierto: 'Pendiente',
  Parcial: 'Parcial',
  Recibido: 'Recibido',
};

export function toFrontPurchaseOrder(d: ApiDocument): PurchaseOrder {
  return {
    id: `${d.type}-${d.series}-${String(d.number).padStart(4, '0')}`,
    date: new Date(d.date).toLocaleDateString(),
    supplier: d.supplier?.name ?? d.client?.name ?? 'Sin entidad',
    total: Number(d.total),
    receiptStatus: RECEIPT_STATUS[d.status] ?? 'Pendiente',
    paymentStatus: d.status === 'Pagado' ? 'Pagado' : 'No Pagado',
  };
}

export function toFrontPurchaseDocument(d: ApiDocument): PurchaseDocument {
  return {
    id: String(d.id),
    number: `${d.type} ${d.series}-${String(d.number).padStart(4, '0')}`,
    type: d.type,
    date: new Date(d.date).toLocaleDateString(),
    supplier: d.supplier?.name ?? '',
    total: Number(d.total),
    status: d.status,
    items: d.items.map((i) => ({
      productId: i.productId != null ? String(i.productId) : '',
      name: i.description,
      sku: '',
      ordered: Number(i.quantity),
      received: 0,
      unitPrice: Number(i.unitPrice ?? 0),
    })),
  };
}

export function toFrontSale(d: ApiDocument): SaleTransaction {
  const payment = d.payments?.[0];
  return {
    id: String(d.id),
    type: 'Venta',
    date: new Date(d.date).toLocaleString(),
    createdAt: d.date,
    clientName: d.client?.name ?? d.supplier?.name ?? 'Sin entidad',
    clientType: d.client?.type ?? 'Retail',
    amount: Number(d.total),
    paymentStatus: d.status === 'Pagado' ? 'Pagado' : 'Pendiente',
    fulfillmentStatus: d.status === 'Pagado' ? 'Entregado' : 'Nuevo',
    paymentMethod: payment?.method ?? '—',
    itemsCount: d.items.reduce((acc, i) => acc + Number(i.quantity), 0),
    items: d.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice ?? 0),
    })),
  };
}