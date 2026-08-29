import React, { useEffect, useState } from 'react';
import { ViewPath, PurchaseDocument, WarehouseOption, Product } from '../../types';

interface GoodsReceiptViewProps {
  orders: PurchaseDocument[];
  warehouses: WarehouseOption[];
  products: Product[];
  onReceive: (
    orderId: string,
    items: { productId: number; quantity: number }[],
    warehouseId: number,
    notes?: string,
  ) => Promise<void>;
  onNavigate: (view: ViewPath) => void;
}

interface ReceiptLine {
  productId: string;
  sku: string;
  name: string;
  ordered: number;
  received: number;
}

export const GoodsReceiptView: React.FC<GoodsReceiptViewProps> = ({
  orders,
  warehouses,
  products,
  onReceive,
  onNavigate,
}) => {
  const [selectedPo, setSelectedPo] = useState(orders[0]?.id || '');
  const [remitoNum, setRemitoNum] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouse, setWarehouse] = useState(''); // userName
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ReceiptLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const selectedOrder = orders.find((o) => o.id === selectedPo);

  // Derive receipt lines whenever the selected open order changes.
  useEffect(() => {
    setItems((prev) => {
      const order = orders.find((o) => o.id === selectedPo);
      if (!order) return [];
      return order.items.map((it) => {
        const existing = prev.find((p) => p.productId === it.productId && p.ordered === it.ordered);
        return {
          productId: it.productId,
          sku: products.find((p) => p.id === it.productId)?.sku ?? '',
          name: it.name,
          ordered: it.ordered,
          received: existing ? existing.received : it.ordered,
        };
      });
    });
    if (warehouse === '') setWarehouse(String(warehouses[0]?.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPo, orders]);

  const lineStatus = (line: ReceiptLine) =>
    line.received >= line.ordered ? 'Completo' : line.received > 0 ? 'Parcial' : 'Pendiente';

  const handleSave = async () => {
    setError('');
    if (!selectedOrder) {
      setError('Seleccione una orden de compra abierta.');
      return;
    }
    if (!warehouse) {
      setError('Seleccione el almacén destino.');
      return;
    }
    const payload = items
      .filter((l) => l.received > 0)
      .map((l) => ({ productId: Number(l.productId), quantity: l.received }));
    if (payload.length === 0) {
      setError('Ingrese al menos una cantidad recibida mayor a cero.');
      return;
    }
    setSaving(true);
    try {
      const combinedNotes = [remitoNum ? `Remito: ${remitoNum}` : '', notes]
        .filter(Boolean)
        .join(' | ');
      await onReceive(
        selectedOrder.id,
        payload,
        Number(warehouse),
        combinedNotes || undefined,
      );
      setSaved(true);
      setTimeout(() => {
        onNavigate('compras');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la recepción.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full p-lg gap-lg font-body-md text-on-surface">
      <header className="flex items-center justify-between pb-sm border-b border-outline-variant/30">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-xs">
            <button onClick={() => onNavigate('compras')} className="hover:text-primary transition-colors cursor-pointer">
              Compras
            </button>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="text-on-surface font-semibold">Registrar Remito de Recepción</span>
          </nav>
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">Recepcionar Mercadería (Remito)</h1>
        </div>
        <div className="flex gap-sm">
          <button
            onClick={() => onNavigate('compras')}
            className="px-md py-sm rounded-lg border border-outline-variant text-on-surface font-label-md text-label-md uppercase tracking-wider hover:bg-surface-container transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-md py-sm rounded-lg bg-tertiary-container text-on-tertiary-container font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity shadow-md flex items-center gap-sm cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {saving ? 'Procesando...' : 'Confirmar Recepción'}
          </button>
        </div>
      </header>

      {saved ? (
        <div className="p-xl text-center py-20 bg-surface-container-lowest rounded-xl shadow-md border border-outline-variant/30 flex flex-col items-center gap-md">
          <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">inventory_2</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Remito Registrado y Stock Actualizado</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">El inventario físico ha sido incrementado en las cantidades recepcionadas.</p>
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
              {/* Header Data */}
              <section className="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
                <h2 className="font-headline-md text-headline-md mb-md flex items-center gap-sm text-primary">
                  <span className="material-symbols-outlined">receipt_long</span>
                  Datos del Remito
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Orden de Compra Asociada</label>
                    <select
                      value={selectedPo}
                      onChange={(e) => setSelectedPo(e.target.value)}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none cursor-pointer"
                    >
                      <option value="">Seleccione una OC abierta...</option>
                      {orders.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.number} - {o.supplier} (${o.total.toFixed(2)})
                        </option>
                      ))}
                    </select>
                    {orders.length === 0 && (
                      <p className="text-xs text-on-surface-variant">No hay órdenes de compra abiertas. Cree una desde Compras → Nueva Orden.</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Nº Remito del Proveedor</label>
                    <input
                      type="text"
                      value={remitoNum}
                      onChange={(e) => setRemitoNum(e.target.value)}
                      placeholder="Opcional"
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none font-mono-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Fecha de Ingreso</label>
                    <input
                      type="date"
                      value={receivedDate}
                      onChange={(e) => setReceivedDate(e.target.value)}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Almacén Destino</label>
                    <select
                      value={warehouse}
                      onChange={(e) => setWarehouse(e.target.value)}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none cursor-pointer"
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Items table */}
              <section className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 overflow-hidden">
                <div className="p-lg border-b border-outline-variant/20 bg-surface-container/30">
                  <h2 className="font-headline-md text-headline-md flex items-center gap-sm text-primary">
                    <span className="material-symbols-outlined">rule</span>
                    Verificación de Ítems
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant/20 font-label-md text-label-md text-on-surface-variant uppercase">
                        <th className="py-sm px-md">SKU</th>
                        <th className="py-sm px-md">Producto</th>
                        <th className="py-sm px-md text-right">Cant. Solicitada</th>
                        <th className="py-sm px-md text-right">Cant. Recibida</th>
                        <th className="py-sm px-md text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="font-body-md divide-y divide-outline-variant/10">
                      {items.map((item) => {
                        const status = lineStatus(item);
                        return (
                          <tr key={item.productId} className="hover:bg-surface-container/20">
                            <td className="py-md px-md font-mono-sm font-bold text-primary">{item.sku}</td>
                            <td className="py-md px-md font-medium">{item.name}</td>
                            <td className="py-md px-md text-right font-mono-sm">{item.ordered} u.</td>
                            <td className="py-md px-md text-right">
                              <input
                                type="number"
                                min="0"
                                max={item.ordered}
                                value={item.received}
                                onChange={(e) => {
                                  const val = Math.max(0, Math.min(item.ordered, Number(e.target.value) || 0));
                                  setItems((prev) => prev.map((it) => (it.productId === item.productId ? { ...it, received: val } : it)));
                                }}
                                className="w-24 bg-surface border border-outline-variant rounded px-sm py-xs text-right font-mono-sm focus:border-primary outline-none"
                              />
                            </td>
                            <td className="py-md px-md text-center">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  status === 'Completo'
                                    ? 'bg-tertiary-container text-on-tertiary-container'
                                    : status === 'Parcial'
                                      ? 'bg-secondary-container/20 text-secondary'
                                      : 'bg-outline-variant/20 text-on-surface-variant'
                                }`}
                              >
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* Right column */}
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
                  <span className="font-label-md text-label-md uppercase tracking-wider">Control de Calidad</span>
                </div>
                <p className="text-xs text-on-surface-variant">
                  Al confirmar la recepción, los artículos ingresarán inmediatamente al stock activo del almacén seleccionado con trazabilidad auditada.
                </p>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
};