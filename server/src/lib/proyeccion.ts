/**
 * Proyección F1.3: reconoce una sola vez cada hecho económico.
 *
 * Reglas:
 *   - VENTA y COMPRA son los hechos contables (ingreso/egreso).
 *   - La FACTURA es la copia fiscal del hecho: se cuenta SOLO si su linaje de
 *     `sourceDocumentId` no llega a un hecho contable del mismo lado
 *     (VENTA para facturas de cliente, COMPRA para facturas de proveedor).
 *     Así una VENTA facturada no se duplica, pero la venta diferida
 *     (PEDIDO → REMITO → FACTURA, sin VENTA) sí se reconoce.
 *   - OC, PEDIDO, COTIZACION y REMITO nunca son hechos económicos: son
 *     órdenes y movimientos logísticos.
 */

export type AncestroInfo = { type: string; sourceDocumentId: number | null };

export function tipoHechoEconomico(
  doc: { type: string; clientId: number | null; supplierId: number | null; sourceDocumentId: number | null },
  ancestroDe: Map<number, AncestroInfo>,
): 'ingreso' | 'egreso' | null {
  if (doc.type === 'VENTA') return 'ingreso';
  if (doc.type === 'COMPRA') return 'egreso';
  if (doc.type !== 'FACTURA') return null;
  const hechoContable = doc.clientId != null ? 'VENTA' : doc.supplierId != null ? 'COMPRA' : null;
  if (hechoContable === null) return null;
  if (tieneAncestroContable(doc.sourceDocumentId, hechoContable, ancestroDe)) return null;
  return hechoContable === 'VENTA' ? 'ingreso' : 'egreso';
}

function tieneAncestroContable(
  fromId: number | null,
  hechoContable: string,
  ancestroDe: Map<number, AncestroInfo>,
): boolean {
  const vistos = new Set<number>();
  let cur = fromId;
  while (cur !== null && !vistos.has(cur)) {
    vistos.add(cur);
    const ancestro = ancestroDe.get(cur);
    if (!ancestro) return false;
    if (ancestro.type === hechoContable) return true;
    cur = ancestro.sourceDocumentId;
  }
  return false;
}