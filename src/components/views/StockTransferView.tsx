import React, { useState } from 'react';
import { ViewPath, Product, WarehouseOption } from '../../types';
import { transferError } from '../../lib/branch';

interface StockTransferViewProps {
  products: Product[];
  warehouses: WarehouseOption[];
  onTransfer: (payload: {
    productId: number;
    fromWarehouseId: number;
    toWarehouseId: number;
    quantity: number;
    reason?: string;
  }) => Promise<void>;
  onNavigate: (view: ViewPath) => void;
}

export const StockTransferView: React.FC<StockTransferViewProps> = ({ products, warehouses, onTransfer, onNavigate }) => {
  const [sourceWarehouseId, setSourceWarehouseId] = useState<number>(warehouses[0]?.id ?? 0);
  const [targetWarehouseId, setTargetWarehouseId] = useState<number>(warehouses[1]?.id ?? 0);
  const [productId, setProductId] = useState<string>(products[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);

  const selectedProduct = products.find((p) => p.id === productId);
  // El backend descuenta del depósito de ORIGEN: el máximo transferible es el
  // stock de ese depósito, no el total del producto.
  const sourceStock = selectedProduct?.stocks.find((s) => s.warehouseId === sourceWarehouseId)?.quantity;
  const validationError = transferError(selectedProduct, warehouses, sourceWarehouseId, targetWarehouseId, quantity);

  const handleQtyChange = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta));
  };

  const handleConfirm = async () => {
    if (saving || refreshFailed) return;
    if (validationError || !selectedProduct) {
      setError(validationError ?? 'Seleccioná un producto.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onTransfer({
        productId: Number(selectedProduct.id),
        fromWarehouseId: sourceWarehouseId,
        toWarehouseId: targetWarehouseId,
        quantity,
        reason: notes || undefined,
      });
      setCompleted(`Se transfirieron ${quantity} unidades de ${selectedProduct.name} entre depósitos.`);
      setTimeout(() => onNavigate('inventario'), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo transferir el stock';
      setError(msg);
      if (msg.startsWith('La transferencia se registró')) setRefreshFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full gap-lg">
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-md w-full">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface">Transferencia de Stock</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">Mueva productos entre los depósitos habilitados de la empresa.</p>
        </div>
        <div className="flex gap-md flex-wrap">
          <button
            onClick={() => onNavigate('inventario')}
            className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md px-md py-sm rounded-full transition-colors flex items-center gap-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">history</span>
            Historial / Volver
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || refreshFailed || !!validationError || !!completed}
            className="bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md px-lg py-sm rounded-full transition-colors flex items-center gap-sm shadow-md cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {saving ? 'Procesando...' : 'Confirmar Transferencia'}
          </button>
        </div>
      </div>

      {completed ? (
        <div className="bg-surface-container-lowest p-xl rounded-xl shadow-md border border-outline-variant/30 text-center py-16 flex flex-col items-center gap-md">
          <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">swap_horiz</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Transferencia Registrada</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            {completed}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-lg w-full items-start">
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-lg">
            {/* Warehouse Selectors */}
            <div className="bg-surface-container-lowest shadow-sm rounded-xl p-lg flex flex-col sm:flex-row gap-lg relative overflow-hidden border border-outline-variant/20">
              <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none"></div>
              <div className="flex-1 flex flex-col gap-md">
                <label className="font-label-md text-label-md text-on-surface uppercase">Depósito de Origen</label>
                <div className="relative w-full">
                  <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">warehouse</span>
                  <select
                    value={sourceWarehouseId}
                    onChange={(e) => setSourceWarehouseId(Number(e.target.value))}
                    className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md pl-12 pr-md py-md rounded-lg appearance-none cursor-pointer hover:bg-surface-container-high transition-colors outline-none"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-md top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
                </div>
              </div>

              <div className="flex items-center justify-center pt-sm sm:pt-xl">
                <span className="material-symbols-outlined text-outline-variant text-[32px]">arrow_forward</span>
              </div>

              <div className="flex-1 flex flex-col gap-md">
                <label className="font-label-md text-label-md text-on-surface uppercase">Depósito de Destino</label>
                <div className="relative w-full">
                  <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">warehouse</span>
                  <select
                    value={targetWarehouseId}
                    onChange={(e) => setTargetWarehouseId(Number(e.target.value))}
                    className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md pl-12 pr-md py-md rounded-lg appearance-none cursor-pointer hover:bg-surface-container-high transition-colors outline-none"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-md top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
                </div>
              </div>
            </div>

            {/* Product to Transfer */}
            <div className="bg-surface-container-lowest shadow-sm rounded-xl p-lg flex flex-col gap-md border border-outline-variant/20">
              <h2 className="font-headline-md text-headline-md text-on-surface">Producto a Transferir</h2>
              {error && (
                <div role="alert" className="p-sm bg-error-container/20 text-on-error-container rounded-lg font-label-md text-sm flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[18px]">error</span> {error}
                </div>
              )}
              {!error && validationError && <p className="text-error text-body-sm">{validationError}</p>}
              <div className="flex flex-col md:flex-row gap-md items-start md:items-end">
                <div className="flex-1 flex flex-col gap-xs w-full">
                  <label className="font-label-md text-label-md uppercase text-on-surface-variant">Producto *</label>
                  <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none cursor-pointer w-full"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku || 'sin SKU'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-xs">
                  <label className="font-label-md text-label-md uppercase text-on-surface-variant">Cantidad *</label>
                  <div className="inline-flex items-center bg-surface-container-high rounded-full overflow-hidden border border-outline-variant/30">
                    <button
                      type="button"
                      onClick={() => handleQtyChange(-1)}
                      className="px-sm py-xs text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">remove</span>
                    </button>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Cantidad a transferir"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-20 text-center font-body-md text-body-md text-on-surface font-mono-sm font-bold bg-transparent outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleQtyChange(1)}
                      className="px-sm py-xs text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                    </button>
                  </div>
                </div>
              </div>

              {selectedProduct && (
                <div className="flex items-center gap-md p-md bg-surface-container-low rounded-lg border border-outline-variant/30">
                  <div className="w-10 h-10 rounded bg-surface-container-high flex items-center justify-center overflow-hidden shrink-0">
                    <span className="material-symbols-outlined text-outline">inventory_2</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body-md text-body-md text-on-surface font-semibold truncate">{selectedProduct.name}</p>
                    <p className="font-mono-sm text-mono-sm text-on-surface-variant truncate">{selectedProduct.sku} · {selectedProduct.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-label-md text-label-md text-on-surface-variant uppercase">Stock en origen</p>
                    <span className="inline-flex items-center px-2 py-1 rounded bg-secondary-container/20 text-secondary-container font-label-md text-label-md">
                      {sourceStock ?? '—'} unid.
                    </span>
                    {(sourceStock == null || sourceStock <= 0) && (
                      <p className="font-body-sm text-body-sm text-error mt-xs">Sin stock en origen</p>
                    )}
                  </div>
                </div>
              )}
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
            </div>

            <div className="bg-surface-container-highest shadow-sm rounded-xl p-lg relative overflow-hidden border border-outline-variant/20">
              <h4 className="font-label-md text-label-md text-on-surface-variant uppercase mb-md">Resumen de Operación</h4>
              <div className="flex justify-between items-center py-sm border-b border-surface-variant/50">
                <span className="font-body-md text-body-md text-on-surface-variant min-w-0 truncate">Producto</span>
                <span className="font-body-md text-body-md text-on-surface font-semibold shrink-0">{selectedProduct?.name ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center py-sm border-b border-surface-variant/50">
                <span className="font-body-md text-body-md text-on-surface-variant min-w-0 truncate">Cantidad</span>
                <span className="font-body-lg text-body-lg text-on-surface font-semibold shrink-0">{quantity} unid.</span>
              </div>
              <div className="flex justify-between items-center py-sm border-b border-surface-variant/50">
                <span className="font-body-md text-body-md text-on-surface-variant min-w-0 truncate">Origen</span>
                <span className="font-body-md text-body-md text-on-surface shrink-0">{warehouses.find((w) => w.id === sourceWarehouseId)?.name ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center py-sm pt-md">
                <span className="font-body-md text-body-md text-on-surface-variant min-w-0 truncate">Destino</span>
                <span className="font-body-md text-body-md text-on-surface shrink-0">{warehouses.find((w) => w.id === targetWarehouseId)?.name ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
