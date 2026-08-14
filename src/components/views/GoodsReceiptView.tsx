import React, { useState } from 'react';
import { ViewPath, PurchaseOrder } from '../../types';

interface GoodsReceiptViewProps {
  orders: PurchaseOrder[];
  onNavigate: (view: ViewPath) => void;
}

export const GoodsReceiptView: React.FC<GoodsReceiptViewProps> = ({ orders, onNavigate }) => {
  const [selectedPo, setSelectedPo] = useState(orders[0]?.id || '');
  const [remitoNum, setRemitoNum] = useState('REM-2023-9901');
  const [receivedDate, setReceivedDate] = useState('2026-08-13');
  const [warehouse, setWarehouse] = useState('Depósito Central');
  const [notes, setNotes] = useState('Recepción en buen estado, paquete verificado.');
  const [items, setItems] = useState([
    { sku: 'EL-LP-001', name: 'Laptop Pro X1', ordered: 10, received: 10, status: 'Completo' },
    { sku: 'EL-KB-042', name: 'Teclado Mecánico K2', ordered: 20, received: 15, status: 'Parcial' },
  ]);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => {
      onNavigate('compras');
    }, 1500);
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
            className="px-md py-sm rounded-lg bg-tertiary-container text-on-tertiary-container font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity shadow-md flex items-center gap-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            Confirmar Recepción
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
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.id} - {o.supplier} (${o.total.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-label-md text-label-md text-on-surface-variant uppercase">Nº Remito del Proveedor</label>
                  <input
                    type="text"
                    value={remitoNum}
                    onChange={(e) => setRemitoNum(e.target.value)}
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
                    <option value="Depósito Central">Depósito Central</option>
                    <option value="Tienda Norte">Tienda Norte</option>
                    <option value="Bodega Sur">Bodega Sur</option>
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
                    {items.map((item, idx) => (
                      <tr key={item.sku} className="hover:bg-surface-container/20">
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
                              const val = Number(e.target.value);
                              setItems((prev) =>
                                prev.map((it, i) =>
                                  i === idx
                                    ? {
                                        ...it,
                                        received: val,
                                        status: val === item.ordered ? 'Completo' : 'Parcial',
                                      }
                                    : it
                                )
                              );
                            }}
                            className="w-24 bg-surface border border-outline-variant rounded px-sm py-xs text-right font-mono-sm focus:border-primary outline-none"
                          />
                        </td>
                        <td className="py-md px-md text-center">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              item.status === 'Completo'
                                ? 'bg-tertiary-container text-on-tertiary-container'
                                : 'bg-secondary-container/20 text-secondary'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
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
      )}
    </div>
  );
};
