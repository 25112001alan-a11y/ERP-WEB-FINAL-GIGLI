import React, { useEffect, useState } from 'react';
import { formatMoney } from '../../lib/format';
import { ViewPath, Product, WarehouseOption } from '../../types';
import type { ApiDocument } from '../../lib/mappers';
import { deliverySourceDocuments, derivedDocumentLines } from '../../lib/documentDerivation';

interface RemitoSalidaViewProps {
  salesDocs: ApiDocument[];
  products: Product[];
  warehouses: WarehouseOption[];
  /** Document chosen in Ventas: preloaded as origin when it is still eligible. */
  initialSourceId?: string | null;
  onRegisterRemitoSalida: (payload: {
    direction: 'egreso';
    sourceDocumentId: number;
    warehouseId?: number;
    items: { productId: number; sourceDocumentItemId?: number; quantity: number; unitPrice?: number }[];
    externalNumber?: string;
    notes?: string;
  }) => Promise<void>;
  onNavigate: (view: ViewPath) => void;
}

interface DraftLine {
  key: string;
  sourceDocumentItemId: number;
  productId: string;
  name: string;
  originalQuantity: number;
  maxQuantity: number;
  quantity: number;
  unitPrice: number;
}

export const RemitoSalidaView: React.FC<RemitoSalidaViewProps> = ({
  salesDocs,
  products,
  warehouses,
  initialSourceId,
  onRegisterRemitoSalida,
  onNavigate,
}) => {
  // Only compatible client sales and orders are offered. The backend remains the final
  // authority for pending quantities and racing requests.
  const ventas = deliverySourceDocuments(salesDocs);
  const [sourceId, setSourceId] = useState(() =>
    initialSourceId && ventas.some((d) => String(d.id) === initialSourceId) ? initialSourceId : '');
  const [warehouseId, setWarehouseId] = useState('');
  const [externalNumber, setExternalNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const selectedVenta = ventas.find((d) => String(d.id) === sourceId);
  const isDeferredDispatch = selectedVenta?.type === 'PEDIDO';
  const dispatchWarehouses = warehouses.filter((warehouse) =>
    selectedVenta?.branchId == null || (warehouse.branch?.id ?? warehouse.branchId) === selectedVenta.branchId);

  useEffect(() => {
    if (!selectedVenta) {
      setLines([]);
      return;
    }
    setLines(derivedDocumentLines(selectedVenta).map((line) => {
      const sku = products.find((product) => product.id === line.productId)?.sku;
      return { ...line, name: sku ? `${sku} — ${line.name}` : line.name };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const handleSubmit = async () => {
    setError('');
    if (!selectedVenta?.client) {
      setError('Seleccione una venta o pedido con cliente para despachar.');
      return;
    }
    if (isDeferredDispatch && selectedVenta.warehouseId == null && !warehouseId) {
      setError('Seleccione un depósito para despachar el pedido.');
      return;
    }
    const payloadLines = lines
      .filter((l) => l.quantity > 0)
      .map((l) => ({ productId: Number(l.productId), sourceDocumentItemId: l.sourceDocumentItemId, quantity: l.quantity }));
    if (payloadLines.length === 0) {
      setError('Ingrese al menos una cantidad mayor a cero.');
      return;
    }
    setSaving(true);
    try {
      await onRegisterRemitoSalida({
        direction: 'egreso',
        sourceDocumentId: selectedVenta.id,
        warehouseId: isDeferredDispatch && selectedVenta.warehouseId == null ? Number(warehouseId) : undefined,
        items: payloadLines,
        externalNumber: externalNumber || undefined,
        notes: notes || undefined,
      });
      setSaved(true);
      setTimeout(() => onNavigate('ventas'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el remito de salida.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full p-lg gap-lg font-body-md text-on-surface">
      <header className="flex items-center justify-between pb-sm border-b border-outline-variant/30 flex-wrap gap-sm">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-xs">
            <button onClick={() => onNavigate('ventas')} className="hover:text-primary transition-colors cursor-pointer">
              Ventas
            </button>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="text-on-surface font-semibold">Remito de Salida</span>
          </nav>
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">Despachar Mercadería (Remito de Entrega)</h1>
        </div>
        <div className="flex gap-sm flex-wrap">
          <button
            onClick={() => onNavigate('ventas')}
            className="px-md py-sm rounded-lg border border-outline-variant text-on-surface font-label-md text-label-md uppercase tracking-wider hover:bg-surface-container transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-md py-sm rounded-lg bg-tertiary-container text-on-tertiary-container font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity shadow-md flex items-center gap-sm cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {saving ? 'Procesando...' : 'Registrar Remito'}
          </button>
        </div>
      </header>

      {saved ? (
        <div className="p-xl text-center py-20 bg-surface-container-lowest rounded-xl shadow-md border border-outline-variant/30 flex flex-col items-center gap-md">
          <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">local_shipping</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Remito de Salida Registrado</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            {isDeferredDispatch
              ? 'El remito quedó vinculado al pedido y descontó del depósito la cantidad entregada.'
              : 'El remito quedó vinculado a la venta; el stock ya fue descontado por la VENTA.'}
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div className="bg-error/10 text-error px-md py-sm rounded-lg border border-error/30 font-body-md flex items-center gap-sm">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
            <div className="lg:col-span-2 space-y-lg">
              <section className="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
                <h2 className="font-headline-md text-headline-md mb-md flex items-center gap-sm text-primary">
                  <span className="material-symbols-outlined">point_of_sale</span>
                  Venta o Pedido a Despachar
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Documento Asociado</label>
                    <select
                      value={sourceId}
                      onChange={(e) => { setSourceId(e.target.value); setWarehouseId(''); }}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none cursor-pointer"
                    >
                      <option value="">Seleccione una venta o pedido...</option>
                      {ventas.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.type} {v.series}-{String(v.number).padStart(4, '0')} — {v.client?.name} ({formatMoney(Number(v.total))})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Nº Remito del Cliente (ref.)</label>
                    <input
                      type="text"
                      maxLength={50}
                      value={externalNumber}
                      onChange={(e) => setExternalNumber(e.target.value)}
                      placeholder="Opcional"
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none font-mono-sm"
                    />
                  </div>
                </div>
                {isDeferredDispatch && selectedVenta.warehouseId == null && (
                  <div className="flex flex-col gap-xs mt-md">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Depósito de despacho</label>
                    <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none cursor-pointer">
                      <option value="">Seleccione un depósito...</option>
                      {dispatchWarehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedVenta && (
                  <p className="mt-md text-xs text-on-surface-variant">
                    Cliente: <span className="font-semibold text-on-surface">{selectedVenta.client?.name}</span>
                    {selectedVenta.branchId != null && <> — Sucursal #{selectedVenta.branchId}</>}
                    {selectedVenta.warehouseId != null && <> — Depósito #{selectedVenta.warehouseId}</>}
                    {' '}— {isDeferredDispatch
                      ? 'el stock se descontará al registrar este remito.'
                      : 'derivados de la venta; el stock ya fue descontado al crearla.'}
                  </p>
                )}
              </section>

              <section className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 overflow-hidden">
                <div className="p-lg border-b border-outline-variant/20 bg-surface-container/30">
                  <h2 className="font-headline-md text-headline-md flex items-center gap-sm text-primary">
                    <span className="material-symbols-outlined">rule</span>
                    Ítems a Entregar
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant/20 font-label-md text-label-md text-on-surface-variant uppercase">
                        <th className="py-sm px-md">Producto</th>
                        <th className="py-sm px-md text-right">Origen / pendiente</th>
                        <th className="py-sm px-md text-right">A Entregar</th>
                        <th className="py-sm px-md text-right">P. Unit.</th>
                      </tr>
                    </thead>
                    <tbody className="font-body-md divide-y divide-outline-variant/10">
                      {lines.map((line) => (
                        <tr key={line.key} className="hover:bg-surface-container/20">
                          <td className="py-md px-md font-medium"><span className="truncate max-w-[220px]">{line.name}</span></td>
                          <td className="py-md px-md text-right font-mono-sm">{line.originalQuantity} u. / {line.maxQuantity} u.</td>
                          <td className="py-md px-md text-right">
                            <input
                              type="number"
                              min="0"
                              max={line.maxQuantity}
                              value={line.quantity}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(line.maxQuantity, Number(e.target.value) || 0));
                                setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, quantity: val } : l)));
                              }}
                              className="w-24 bg-surface border border-outline-variant rounded px-sm py-xs text-right font-mono-sm focus:border-primary outline-none"
                            />
                          </td>
                          <td className="py-md px-md text-right font-mono-sm">{formatMoney(line.unitPrice)}</td>
                        </tr>
                      ))}
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-lg px-md text-center text-on-surface-variant">
                            Seleccione una venta o pedido para cargar sus ítems.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div className="space-y-lg">
              <section className="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
                <h2 className="font-headline-md text-headline-md mb-md flex items-center gap-sm text-primary">
                  <span className="material-symbols-outlined">notes</span>
                  Observaciones
                </h2>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full bg-surface border border-outline-variant/50 rounded-lg p-md focus:border-primary outline-none resize-none font-body-md"
                ></textarea>
              </section>
              <section className="bg-surface-container-low p-lg rounded-xl border border-outline-variant/20 flex flex-col gap-sm">
                <div className="flex items-center gap-sm text-tertiary-container">
                  <span className="material-symbols-outlined">verified</span>
                  <span className="font-label-md text-label-md uppercase tracking-wider">{isDeferredDispatch ? 'Salida de stock' : 'Sin efecto de stock'}</span>
                </div>
                <p className="text-xs text-on-surface-variant">
                  {isDeferredDispatch
                    ? 'El PEDIDO no descontó inventario. Este remito registra la salida física de las cantidades entregadas.'
                    : 'La VENTA ya descontó el inventario. Este remito documenta la entrega física al cliente y queda encadenado para la futura factura.'}
                </p>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
