import React, { useState } from 'react';
import { ViewPath, Product } from '../../types';

interface StockTransferViewProps {
  products: Product[];
  onNavigate: (view: ViewPath) => void;
}

export const StockTransferView: React.FC<StockTransferViewProps> = ({ products, onNavigate }) => {
  const [sourceWarehouse, setSourceWarehouse] = useState('A1');
  const [targetWarehouse, setTargetWarehouse] = useState('B2');
  const [quantities, setQuantities] = useState<Record<string, number>>({
    '1': 10,
    '2': 2,
  });
  const [notes, setNote] = useState('');
  const [completed, setCompleted] = useState(false);

  const handleQtyChange = (id: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  };

  const handleConfirm = () => {
    setCompleted(true);
    setTimeout(() => {
      onNavigate('inventario');
    }, 1500);
  };

  const qtyValues = Object.values(quantities) as number[];
  const totalItems = qtyValues.filter((q) => q > 0).length;
  const totalUnits = qtyValues.reduce((acc, q) => acc + q, 0);

  return (
    <div className="flex flex-col w-full gap-lg">
      <div className="flex items-end justify-between w-full">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface">Transferencia de Stock</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">Mueva productos entre almacenes o ubicaciones de la empresa.</p>
        </div>
        <div className="flex gap-md">
          <button
            onClick={() => onNavigate('inventario')}
            className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md px-md py-sm rounded-full transition-colors flex items-center gap-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">history</span>
            Historial / Volver
          </button>
          <button
            onClick={handleConfirm}
            className="bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md px-lg py-sm rounded-full transition-colors flex items-center gap-sm shadow-md cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            Confirmar Transferencia
          </button>
        </div>
      </div>

      {completed ? (
        <div className="bg-surface-container-lowest p-xl rounded-xl shadow-md border border-outline-variant/30 text-center py-16 flex flex-col items-center gap-md">
          <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">swap_horiz</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Transferencia Registrada</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Se han transferido {totalUnits} unidades exitosamente entre depósitos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-lg w-full items-start">
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-lg">
            {/* Warehouse Selectors */}
            <div className="bg-surface-container-lowest shadow-sm rounded-xl p-lg flex flex-col sm:flex-row gap-lg relative overflow-hidden border border-outline-variant/20">
              <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none"></div>
              <div className="flex-1 flex flex-col gap-md">
                <label className="font-label-md text-label-md text-on-surface uppercase">Almacén de Origen</label>
                <div className="relative w-full">
                  <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">warehouse</span>
                  <select
                    value={sourceWarehouse}
                    onChange={(e) => setSourceWarehouse(e.target.value)}
                    className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md pl-12 pr-md py-md rounded-lg appearance-none cursor-pointer hover:bg-surface-container-high transition-colors outline-none"
                  >
                    <option value="A1">CD Principal - Zona Norte (A1)</option>
                    <option value="B2">Sucursal Centro (B2)</option>
                    <option value="C3">Bodega Externa Sur (C3)</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-md top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
                </div>
              </div>

              <div className="flex items-center justify-center pt-sm sm:pt-xl">
                <span className="material-symbols-outlined text-outline-variant text-[32px]">arrow_forward</span>
              </div>

              <div className="flex-1 flex flex-col gap-md">
                <label className="font-label-md text-label-md text-on-surface uppercase">Almacén de Destino</label>
                <div className="relative w-full">
                  <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">warehouse</span>
                  <select
                    value={targetWarehouse}
                    onChange={(e) => setTargetWarehouse(e.target.value)}
                    className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md pl-12 pr-md py-md rounded-lg appearance-none cursor-pointer hover:bg-surface-container-high transition-colors outline-none"
                  >
                    <option value="A1">CD Principal - Zona Norte (A1)</option>
                    <option value="B2">Sucursal Centro (B2)</option>
                    <option value="C3">Bodega Externa Sur (C3)</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-md top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
                </div>
              </div>
            </div>

            {/* Products to Transfer Table */}
            <div className="bg-surface-container-lowest shadow-sm rounded-xl p-lg flex flex-col gap-md border border-outline-variant/20">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-md text-headline-md text-on-surface">Productos a Transferir</h2>
              </div>
              <div className="w-full overflow-x-auto mt-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="font-label-md text-label-md text-on-surface-variant uppercase pb-sm border-b border-surface-variant w-2/5">Producto</th>
                      <th className="font-label-md text-label-md text-on-surface-variant uppercase pb-sm border-b border-surface-variant w-1/5">SKU</th>
                      <th className="font-label-md text-label-md text-on-surface-variant uppercase pb-sm border-b border-surface-variant w-1/5">Stock Origen</th>
                      <th className="font-label-md text-label-md text-on-surface-variant uppercase pb-sm border-b border-surface-variant w-1/5 text-right">Cantidad Transferir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, 3).map((prod) => (
                      <tr key={prod.id} className="hover:bg-surface-container-low transition-colors group">
                        <td className="py-md border-b border-surface-variant">
                          <div className="flex items-center gap-md">
                            <div className="w-10 h-10 rounded bg-surface-container-high flex items-center justify-center overflow-hidden shrink-0">
                              {prod.imageUrl ? (
                                <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover mix-blend-multiply opacity-80" />
                              ) : (
                                <span className="material-symbols-outlined text-outline">inventory_2</span>
                              )}
                            </div>
                            <div>
                              <p className="font-body-md text-body-md text-on-surface font-semibold">{prod.name}</p>
                              <p className="font-mono-sm text-mono-sm text-on-surface-variant">{prod.category}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-md border-b border-surface-variant font-mono-sm text-mono-sm text-on-surface-variant">{prod.sku}</td>
                        <td className="py-md border-b border-surface-variant font-body-md text-body-md text-on-surface">
                          <span className="inline-flex items-center px-2 py-1 rounded bg-secondary-container/20 text-secondary-container font-label-md text-label-md">
                            {prod.stock} unid.
                          </span>
                        </td>
                        <td className="py-md border-b border-surface-variant text-right">
                          <div className="inline-flex items-center bg-surface-container-high rounded-full overflow-hidden border border-outline-variant/30">
                            <button
                              type="button"
                              onClick={() => handleQtyChange(prod.id, -1)}
                              className="px-sm py-xs text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">remove</span>
                            </button>
                            <span className="w-12 text-center font-body-md text-body-md text-on-surface font-mono-sm font-bold">
                              {quantities[prod.id] || 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQtyChange(prod.id, 1)}
                              className="px-sm py-xs text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">add</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Details & Summary */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-lg">
            <div className="bg-surface-container-lowest shadow-sm rounded-xl p-lg flex flex-col gap-md border border-outline-variant/20">
              <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-sm">
                <span className="material-symbols-outlined text-secondary">info</span>
                Detalles de Transferencia
              </h3>
              <div className="flex flex-col gap-sm mt-sm">
                <label className="font-label-md text-label-md text-on-surface uppercase">Motivo / Observaciones</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej. Reabastecimiento por temporada alta..."
                  rows={4}
                  className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md p-md rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-secondary-container transition-all"
                ></textarea>
              </div>
              <div className="flex flex-col gap-sm mt-md">
                <label className="font-label-md text-label-md text-on-surface uppercase">Responsable de Autorización</label>
                <div className="relative w-full">
                  <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">person</span>
                  <select className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md pl-12 pr-md py-sm rounded-lg appearance-none cursor-pointer outline-none">
                    <option value="1">Carlos Mendoza (Jefe de Logística)</option>
                    <option value="2">Ana Silva (Gerente Operaciones)</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-md top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-highest shadow-sm rounded-xl p-lg relative overflow-hidden border border-outline-variant/20">
              <h4 className="font-label-md text-label-md text-on-surface-variant uppercase mb-md">Resumen de Operación</h4>
              <div className="flex justify-between items-center py-sm border-b border-surface-variant/50">
                <span className="font-body-md text-body-md text-on-surface-variant">Total Productos</span>
                <span className="font-body-lg text-body-lg text-on-surface font-semibold">{totalItems}</span>
              </div>
              <div className="flex justify-between items-center py-sm border-b border-surface-variant/50">
                <span className="font-body-md text-body-md text-on-surface-variant">Total Unidades</span>
                <span className="font-body-lg text-body-lg text-on-surface font-semibold">{totalUnits}</span>
              </div>
              <div className="flex justify-between items-center py-sm pt-md">
                <span className="font-body-md text-body-md text-on-surface-variant">Estado Estimado</span>
                <span className="inline-flex items-center gap-xs px-2 py-1 bg-surface-container text-on-surface font-mono-sm text-mono-sm rounded-md">
                  <span className="w-2 h-2 rounded-full bg-tertiary-fixed"></span> Pendiente
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
