import type { Product, PurchaseOrder, PurchaseDocument, SaleTransaction, PublicOrder, DocumentHeaderSnapshot } from '../types';

export interface ApiProduct {
  id: number;
  internalCode: string | null;
  barcode?: string | null;
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
  externalNumber?: string | null;
  notes?: string | null;
  supplier: { id: number; name: string; taxId?: string | null; address?: string | null; province?: string | null; postalCode?: string | null; taxCondition?: string | null } | null;
  client: {
    id: number;
    name: string;
    type: string | null;
    phone?: string | null;
    taxId?: string | null;
    address?: string | null;
    province?: string | null;
    postalCode?: string | null;
    taxCondition?: string | null;
  } | null;
  /** Only detail responses include the branch relation. */
  branch?: { name: string; address?: string | null } | null;
  /** Header identity frozen at creation; null on legacy rows (server hydrates). */
  companyName?: string | null;
  companyTaxId?: string | null;
  companyAddress?: string | null;
  companyProvince?: string | null;
  companyPostalCode?: string | null;
  companyTaxCondition?: string | null;
  clientName?: string | null;
  clientTaxId?: string | null;
  clientAddress?: string | null;
  clientProvince?: string | null;
  clientPostalCode?: string | null;
  clientTaxCondition?: string | null;
  supplierName?: string | null;
  supplierTaxId?: string | null;
  supplierAddress?: string | null;
  supplierProvince?: string | null;
  supplierPostalCode?: string | null;
  supplierTaxCondition?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  /** Branch and warehouse scopes a derived document inherits from its origin. */
  branchId?: number | null;
  warehouseId?: number | null;
  sourceDocumentId?: number | null;
  /** Backend projection: the order already has a derived REMITO. */
  hasDispatch?: boolean;
  invoiceData?: {
    invoiceType: string;
    cae: string | null;
    caeDueDate: string | null;
    puntoVenta: number | null;
    // Supplier voucher capture (fase A)
    supplierCuit?: string | null;
    supplierName?: string | null;
    externalTotal?: string | number | null;
    ingestionMethod?: string | null;
    attachmentUrl?: string | null;
  } | null;
  payments?: { id: number; method: string; status: string; amount?: string | number | null }[];
  items: {
    id: number;
    productId: number | null;
    /** Frozen catalog identity (U4); null on legacy rows. */
    sku?: string | null;
    taxName?: string | null;
    description: string;
    quantity: string | number;
    unitPrice: string | number;
    lineTotal: string | number;
    /** Remaining balance of the source line after derived documents. */
    pendingQuantity?: string | number;
  }[];
}

/**
 * Header identity: frozen snapshot first, the live relation only as fallback
 * for legacy rows created before the snapshot columns existed.
 */
function headerSnapshotOf(d: ApiDocument): DocumentHeaderSnapshot {
  return {
    companyName: d.companyName ?? null,
    companyTaxId: d.companyTaxId ?? null,
    companyAddress: d.companyAddress ?? null,
    companyProvince: d.companyProvince ?? null,
    companyPostalCode: d.companyPostalCode ?? null,
    companyTaxCondition: d.companyTaxCondition ?? null,
    clientName: d.clientName ?? d.client?.name ?? null,
    clientTaxId: d.clientTaxId ?? d.client?.taxId ?? null,
    clientAddress: d.clientAddress ?? d.client?.address ?? null,
    clientProvince: d.clientProvince ?? d.client?.province ?? null,
    clientPostalCode: d.clientPostalCode ?? d.client?.postalCode ?? null,
    clientTaxCondition: d.clientTaxCondition ?? d.client?.taxCondition ?? null,
    supplierName: d.supplierName ?? d.supplier?.name ?? null,
    supplierTaxId: d.supplierTaxId ?? d.supplier?.taxId ?? null,
    supplierAddress: d.supplierAddress ?? d.supplier?.address ?? null,
    supplierProvince: d.supplierProvince ?? d.supplier?.province ?? null,
    supplierPostalCode: d.supplierPostalCode ?? d.supplier?.postalCode ?? null,
    supplierTaxCondition: d.supplierTaxCondition ?? d.supplier?.taxCondition ?? null,
    branchName: d.branchName ?? d.branch?.name ?? null,
    branchAddress: d.branchAddress ?? d.branch?.address ?? null,
  };
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
    barcode: p.barcode ?? null,
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
    stocks: p.stocks.map((s) => ({
      warehouseId: s.warehouseId,
      quantity: Number(s.quantity),
      minStock: Number(s.minStock),
    })),
    description: p.description ?? undefined,
  };
}

// A PEDIDO's status carries logistics, not payment: dispatching an order must not
// make a paid order look unpaid, and a partial payment must not look complete.
const logisticsStatus: Record<string, PublicOrder['logisticsStatus']> = {
  'En Proceso': 'En Proceso',
  Enviado: 'Enviado',
  Anulado: 'Anulado',
};

export function toFrontPublicOrder(d: ApiDocument): PublicOrder {
  const paidPayments = (d.payments ?? []).filter((p) => p.status === 'Pagado');
  const hasPaymentAmounts = paidPayments.some((p) => p.amount != null);
  const paidTotal = paidPayments.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
  const snapshot = headerSnapshotOf(d);
  return {
    ...snapshot,
    id: `${d.type}-${d.series}-${String(d.number).padStart(4, '0')}`,
    documentId: d.id,
    client: snapshot.clientName ?? snapshot.supplierName ?? 'Sin entidad',
    clientType: d.client?.type ?? 'Retail',
    date: new Date(d.date).toLocaleDateString('es-ES'),
    createdAt: d.date,
    total: Number(d.total),
    paymentStatus: hasPaymentAmounts
      ? paidTotal + 0.01 >= Number(d.total) ? 'Pagado' : 'Pendiente'
      : d.status === 'Pagado' ? 'Pagado' : 'Pendiente',
    logisticsStatus: logisticsStatus[d.status] ?? 'Nuevo',
    hasDispatch: Boolean(d.hasDispatch),
    clientPhone: d.client?.phone ?? null,
  };
}

/**
 * The backend refuses to annul a PEDIDO that already has a derived REMITO
 * (documents.routes PATCH /:id/status), so the UI must not offer the action.
 */
export function canCancelPublicOrder(order: PublicOrder): boolean {
  return !order.hasDispatch && order.logisticsStatus !== 'Anulado';
}

const RECEIPT_STATUS: Record<string, PurchaseOrder['receiptStatus']> = {
  Abierto: 'Pendiente',
  Parcial: 'Parcial',
  Recibido: 'Recibido',
};

export function toFrontPurchaseOrder(d: ApiDocument): PurchaseOrder {
  const hasExternalVoucher = Boolean(
    d.invoiceData?.supplierCuit ||
      d.invoiceData?.supplierName ||
      d.invoiceData?.attachmentUrl ||
      d.externalNumber,
  );
  const snapshot = headerSnapshotOf(d);
  return {
    ...snapshot,
    id: `${d.type}-${d.series}-${String(d.number).padStart(4, '0')}`,
    documentId: d.id,
    type: d.type,
    date: new Date(d.date).toLocaleDateString(),
    supplier: snapshot.supplierName ?? snapshot.clientName ?? 'Sin entidad',
    subtotal: Number(d.subtotal),
    totalTax: Number(d.totalTax),
    total: Number(d.total),
    // A COMPRA is itself the physical receipt (it raises ENTRADA movements), so its
    // receipt badge is received by definition. Payment is a separate fact read from
    // status; routing a paid COMPRA through RECEIPT_STATUS would show it as pending.
    receiptStatus:
      d.type === 'COMPRA' ? 'Recibido' : RECEIPT_STATUS[d.status] ?? 'Pendiente',
    paymentStatus: d.status === 'Pagado' ? 'Pagado' : 'No Pagado',
    hasExternalVoucher,
    externalNumber: d.externalNumber ?? undefined,
  };
}

export function toFrontPurchaseDocument(d: ApiDocument): PurchaseDocument {
  const snapshot = headerSnapshotOf(d);
  return {
    ...snapshot,
    id: String(d.id),
    number: `${d.type} ${d.series}-${String(d.number).padStart(4, '0')}`,
    type: d.type,
    date: new Date(d.date).toLocaleDateString(),
    supplier: snapshot.supplierName ?? snapshot.clientName ?? '',
    total: Number(d.total),
    status: d.status,
    externalNumber: d.externalNumber ?? undefined,
    branchId: d.branchId ?? null,
    items: d.items.map((i) => ({
      sourceDocumentItemId: i.id,
      productId: i.productId != null ? String(i.productId) : '',
      name: i.description,
      sku: i.sku ?? '',
      taxName: i.taxName ?? null,
      ordered: Number(i.quantity),
      pendingQuantity: Number(i.pendingQuantity ?? i.quantity),
      received: 0,
      unitPrice: Number(i.unitPrice ?? 0),
    })),
  };
}

export function toFrontSale(d: ApiDocument): SaleTransaction {
  const payment = d.payments?.[0];
  const snapshot = headerSnapshotOf(d);
  return {
    ...snapshot,
    id: String(d.id),
    type: 'Venta',
    date: new Date(d.date).toLocaleString(),
    createdAt: d.date,
    clientName: snapshot.clientName ?? snapshot.supplierName ?? 'Sin entidad',
    clientType: d.client?.type ?? 'Retail',
    clientId: d.client?.id,
    amount: Number(d.total),
    paymentStatus: d.status === 'Pagado' ? 'Pagado' : 'Pendiente',
    fulfillmentStatus: d.status === 'Pagado' ? 'Entregado' : 'Nuevo',
    paymentMethod: payment?.method ?? '—',
    itemsCount: d.items.reduce((acc, i) => acc + Number(i.quantity), 0),
    items: d.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice ?? 0),
      sku: i.sku ?? null,
      taxName: i.taxName ?? null,
    })),
  };
}