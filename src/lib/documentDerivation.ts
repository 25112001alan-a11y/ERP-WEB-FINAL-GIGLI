import type { ApiDocument } from './mappers';

export type DocumentDirection = 'ingreso' | 'egreso';

export interface DerivedDocumentLine {
  key: string;
  sourceDocumentItemId: number;
  productId: string;
  name: string;
  originalQuantity: number;
  quantity: number;
  maxQuantity: number;
  unitPrice: number;
}

export type SourceSelection =
  | { state: 'none' | 'stale'; source: undefined }
  | { state: 'valid'; source: ApiDocument };

const isCancelled = (status: string) => /^(anulad[oa]|cancelad[oa])$/i.test(status.trim());

export function resolveSourceSelection(
  sourceId: string,
  eligibleSources: ApiDocument[],
): SourceSelection {
  if (!sourceId) return { state: 'none', source: undefined };
  const source = eligibleSources.find((document) => String(document.id) === sourceId);
  return source
    ? { state: 'valid', source }
    : { state: 'stale', source: undefined };
}

export function invoiceSourceDocuments(
  direction: DocumentDirection,
  salesDocs: ApiDocument[],
  remitoDocs: ApiDocument[],
): ApiDocument[] {
  if (direction === 'ingreso') {
    return remitoDocs.filter(
      (document) => document.type === 'REMITO' && Boolean(document.supplier) && !isCancelled(document.status),
    );
  }

  return salesDocs.filter((document) => {
    if (!document.client || isCancelled(document.status)) return false;
    if (document.type === 'REMITO') return true;
    if (document.type !== 'VENTA') return false;
    return !salesDocs.some(
      (child) => child.type === 'REMITO' && child.sourceDocumentId === document.id,
    );
  });
}

export function deliverySourceDocuments(salesDocs: ApiDocument[]): ApiDocument[] {
  return salesDocs.filter((document) => {
    if (!['VENTA', 'PEDIDO'].includes(document.type) || !document.client || isCancelled(document.status)) return false;
    if (!document.items.some((item) => Number(item.pendingQuantity ?? item.quantity) > 0)) return false;
    if (document.type === 'PEDIDO') return true;
    return !salesDocs.some(
      (child) => child.type === 'FACTURA' && child.sourceDocumentId === document.id,
    );
  });
}

export function derivedCounterparty(
  source: ApiDocument | undefined,
  direction: DocumentDirection,
): { supplierId: string; clientName: string } {
  if (!source) return { supplierId: '', clientName: '' };
  return direction === 'ingreso'
    ? { supplierId: source.supplier ? String(source.supplier.id) : '', clientName: '' }
    : { supplierId: '', clientName: source.client?.name ?? '' };
}

/** Keep each source line distinct even when several lines use the same product. */
export function derivedDocumentLines(source: ApiDocument): DerivedDocumentLine[] {
  return source.items.flatMap((item) => {
    if (item.productId === null) return [];
    const originalQuantity = Number(item.quantity);
    const pendingQuantity = Math.max(0, Number(item.pendingQuantity ?? item.quantity));
    return [{
      key: `${source.id}-${item.id}`,
      sourceDocumentItemId: item.id,
      productId: String(item.productId),
      name: item.description,
      originalQuantity,
      quantity: pendingQuantity,
      maxQuantity: pendingQuantity,
      unitPrice: Number(item.unitPrice),
    }];
  });
}
