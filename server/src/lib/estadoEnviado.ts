// Clasificador read-only de PEDIDO históricos marcados «Enviado».
// F1.2 (2026-09-30) hizo que «Enviado» signifique «despacho completo por remito»,
// pero los PEDIDO previos marcados a mano no se tocaron. Esta función decide si un
// «Enviado» es consistente con sus remitos de egreso (por línea, vía
// sourceDocumentItemId) o quedó en un estado que requiere revisión humana.

export interface RubroEnviado {
  id: number;
  cantidad: number;
}

export interface EnvioInfo {
  pedido: { id: number; rubros: RubroEnviado[] };
  remitos: { items: { sourceDocumentItemId: number | null; cantidad: number }[] }[];
}

export type Veredicto =
  | { clase: 'consistente' }
  | { clase: 'corto'; rubros: { id: number; pedido: number; entregado: number }[] }
  | { clase: 'sin_despacho' }
  | { clase: 'sin_trazabilidad' };

export function veredictoEnviado(envio: EnvioInfo): Veredicto {
  const { pedido, remitos } = envio;
  if (remitos.length === 0) return { clase: 'sin_despacho' };

  const entregado = new Map<number, number>();
  let trazable = false;
  for (const remito of remitos) {
    for (const item of remito.items) {
      if (item.sourceDocumentItemId == null) continue;
      trazable = true;
      entregado.set(item.sourceDocumentItemId, (entregado.get(item.sourceDocumentItemId) ?? 0) + Number(item.cantidad));
    }
  }

  // Remitos existen pero ninguna línea lleva sourceDocumentItemId: son hijos
  // pre-migración sin linaje por línea; no se puede verificar cantidad a cantidad.
  if (!trazable) return { clase: 'sin_trazabilidad' };

  const cortos = pedido.rubros
    .filter((r) => Number(r.cantidad) > 0 && (entregado.get(r.id) ?? 0) < Number(r.cantidad))
    .map((r) => ({ id: r.id, pedido: Number(r.cantidad), entregado: entregado.get(r.id) ?? 0 }));

  if (cortos.length > 0) return { clase: 'corto', rubros: cortos };
  return { clase: 'consistente' };
}