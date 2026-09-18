import React, { useEffect, useState } from 'react';
import { ViewPath, Product } from '../../types';
import type { ApiDocument } from '../../lib/mappers';

interface RemitoSalidaViewProps {
  salesDocs: ApiDocument[];
  products: Product[];
  onRegisterRemitoSalida: (payload: {
    sourceDocumentId: number;
    clientId: number;
    items: { productId: number; quantity: number; unitPrice: number }[];
    externalNumber?: string;
    notes?: string;
  }) => Promise<void>;
  onNavigate: (view: ViewPath) => void;
}

interface DraftLine {
  key: string;
  productId: string;
  name: string;
  maxQuantity: number;
  quantity: number;
  unitPrice: number;
}

export const RemitoSalidaView: React.FC<RemitoSalidaViewProps> = ({
  salesDocs,
  products,
  onRegisterRemitoSalida,
  onNavigate,
}) => {
  // Only VENTAs can be dispatched; a REMITO de egreso has no stock side effect.
  const ventas = salesDocs.filter((d) => d.type === 'VENTA' && d.client);
  const [sourceId, setSourceId] = useState('');
  const [externalNumber, setExternalNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const selectedVenta = ventas.find((d) => String(d.id) === sourceId);

  useEffect(() => {
    if (!selectedVenta) {
      setLines([]);
      return;
    }
    setLines(
      selectedVenta.items
        .filter((i) => i.productId != null)
        .map((i) => ({
          key: `${selectedVenta.id}-${i.productId}`,
          productId: String(i.productId),
          name: products.find((p) => p.id === String(i.productId))?.sku
            ? `${products.find((p) => p.id === String(i.productId))!.sku} — ${i.description}`
            : i.description,
          maxQuantity: Number(i.quantity),
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice ?? 0),
        })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const handleSubmit = async () => {
    setError('');
    if (!selectedVenta?.client) {
      setError('Seleccione una venta con cliente para despachar.');
      return;
    }
    const payloadLines = lines
      .filter((l) => l.quantity > 0)
      .map((l) => ({ productId: Number(l.productId), quantity: l.quantity, unitPrice: l.unitPrice }));
    if (payloadLines.length === 0) {
      setError('Ingrese al menos una cantidad mayor a cero.');
      return;
    }
    setSaving(true);
    try {
      await onRegisterRemitoSalida({
        sourceDocumentId: selectedVenta.id,
        clientId: selectedVenta.client.id,
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
            El remito quedó vinculado a la venta; el stock ya fue descontado por la VENTA.
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
                  Venta a Despachar
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Venta Asociada</label>
                    <select
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none cursor-pointer"
                    >
                      <option value="">Seleccione una venta...</option>
                      {ventas.map((v) => (
                        <option key={v.id} value={v.id}>
                          VENTA {v.series}-{String(v.number).padStart(4, '0')} — {v.client?.name} (${Number(v.total).toFixed(2)})
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
                {selectedVenta && (
                  <p className="mt-md text-xs text-on-surface-variant">
                    Cliente: <span className="font-semibold text-on-surface">{selectedVenta.client?.name}</span> — El stock ya fue descontado al crear la venta.
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
                        <th className="py-sm px-md text-right">Vendido</th>
                        <th className="py-sm px-md text-right">A Entregar</th>
                        <th className="py-sm px-md text-right">P. Unit.</th>
                      </tr>
                    </thead>
                    <tbody className="font-body-md divide-y divide-outline-variant/10">
                      {lines.map((line) => (
                        <tr key={line.key} className="hover:bg-surface-container/20">
                          <td className="py-md px-md font-medium"><span className="truncate max-w-[220px]">{line.name}</span></td>
                          <td className="py-md px-md text-right font-mono-sm">{line.maxQuantity} u.</td>
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
                          <td className="py-md px-md text-right font-mono-sm">${line.unitPrice.toFixed(2)}</td>
                        </tr>
                      ))}
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-lg px-md text-center text-on-surface-variant">
                            Seleccione una venta para cargar sus ítems.
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
                  <span className="font-label-md text-label-md uppercase tracking-wider">Sin efecto de stock</span>
                </div>
                <p className="text-xs text-on-surface-variant">
                  La VENTA ya descontó el inventario. Este remito documenta la entrega física al cliente y queda encadenado para la futura factura.
                </p>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
};