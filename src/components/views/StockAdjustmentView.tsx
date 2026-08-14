import React, { useState } from 'react';
import { ViewPath, Product } from '../../types';

interface StockAdjustmentViewProps {
  products: Product[];
  onApplyAdjustment: (productId: string, delta: number) => void;
  onNavigate: (view: ViewPath) => void;
}

export const StockAdjustmentView: React.FC<StockAdjustmentViewProps> = ({
  products,
  onApplyAdjustment,
  onNavigate,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(products[0] || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [type, setType] = useState<'increment' | 'decrement'>('increment');
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState('miscount');
  const [note, setNote] = useState('');
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    setSearchQuery(prod.name);
    setSearchResultsOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || amount <= 0) return;

    const delta = type === 'increment' ? amount : -amount;
    onApplyAdjustment(selectedProduct.id, delta);

    setAppliedMessage(`Ajuste de stock aplicado a "${selectedProduct.name}" (${type === 'increment' ? '+' : '-'}${amount} unidades)`);
    setTimeout(() => {
      setAppliedMessage(null);
      onNavigate('inventario');
    }, 1500);
  };

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col w-full h-full justify-center items-center p-lg relative overflow-hidden bg-surface">
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none">
        <svg height="100%" width="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#gridPattern)" />
        </svg>
      </div>

      {/* Main Adjustment Card */}
      <div className="w-full max-w-3xl bg-surface-container-lowest rounded-xl shadow-xl z-10 relative overflow-hidden border border-outline-variant/30">
        <div className="h-2 w-full bg-secondary-container"></div>
        
        {appliedMessage ? (
          <div className="p-xl text-center flex flex-col items-center justify-center py-16 gap-md">
            <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-[36px]">check_circle</span>
            </div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">Ajuste Registrado</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md">{appliedMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-xl flex flex-col gap-lg">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-display-lg text-display-lg text-on-surface mb-xs tracking-tight">Ajuste de Stock</h1>
                <p className="font-body-md text-body-md text-on-surface-variant">Modifique las existencias para reflejar la realidad del almacén.</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-secondary-container/10 text-secondary flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">inventory_2</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg mt-md">
              {/* Product Autocomplete */}
              <div className="flex flex-col gap-xs md:col-span-2 relative">
                <label className="font-label-md text-label-md text-on-surface-variant uppercase">Producto</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">search</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSearchResultsOpen(true);
                    }}
                    onFocus={() => setSearchResultsOpen(true)}
                    placeholder="Buscar por nombre, SKU..."
                    className="w-full bg-surface-container border-none rounded-lg py-md pl-12 pr-md text-body-lg text-on-surface focus:ring-2 focus:ring-secondary-container transition-all outline-none"
                  />
                </div>

                {searchResultsOpen && (
                  <div className="absolute top-full left-0 right-0 mt-sm bg-surface-container-lowest shadow-xl rounded-lg overflow-hidden z-30 border border-outline-variant/30 max-h-60 overflow-y-auto">
                    {filtered.map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => handleSelectProduct(prod)}
                        className="w-full text-left p-md hover:bg-surface-container-low transition-colors flex items-center justify-between border-b border-surface-container cursor-pointer"
                      >
                        <div>
                          <p className="font-body-md text-body-md text-on-surface font-semibold">{prod.name}</p>
                          <p className="font-mono-sm text-mono-sm text-outline">SKU: {prod.sku}</p>
                        </div>
                        <span className="font-mono-sm text-mono-sm bg-surface-container px-sm py-base rounded text-on-surface-variant font-bold">
                          Stock: {prod.stock}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Current Stock Preview Card */}
              <div className="bg-surface-container-low p-md rounded-lg flex flex-col justify-center relative overflow-hidden group border border-outline-variant/20">
                <div className="absolute right-0 bottom-0 opacity-5 group-hover:scale-110 transition-transform duration-500">
                  <span className="material-symbols-outlined text-[100px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>dataset</span>
                </div>
                <label className="font-label-md text-label-md text-on-surface-variant uppercase mb-xs z-10">Stock Actual</label>
                <div className="flex items-baseline gap-sm z-10">
                  <span className="font-display-lg text-display-lg text-on-surface">
                    {selectedProduct ? selectedProduct.stock : 0}
                  </span>
                  <span className="font-body-md text-body-md text-on-surface-variant">unidades</span>
                </div>
              </div>

              {/* Adjustment Type Toggle */}
              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md text-on-surface-variant uppercase">Tipo de Ajuste</label>
                <div className="flex bg-surface-container rounded-lg p-base">
                  <button
                    type="button"
                    onClick={() => setType('increment')}
                    className={`flex-1 py-sm px-md rounded-md font-label-md text-label-md text-center transition-all flex items-center justify-center gap-xs cursor-pointer ${
                      type === 'increment'
                        ? 'bg-surface-container-lowest shadow-sm text-on-surface font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px] text-tertiary-fixed-dim">arrow_upward</span> Incremento
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('decrement')}
                    className={`flex-1 py-sm px-md rounded-md font-label-md text-label-md text-center transition-all flex items-center justify-center gap-xs cursor-pointer ${
                      type === 'decrement'
                        ? 'bg-surface-container-lowest shadow-sm text-on-surface font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px] text-error">arrow_downward</span> Decremento
                  </button>
                </div>
              </div>

              {/* Quantity to Adjust */}
              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md text-on-surface-variant uppercase">Cantidad a Ajustar</label>
                <input
                  type="number"
                  min="1"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-surface-container border-none rounded-lg py-md px-md text-body-lg text-on-surface focus:ring-2 focus:ring-secondary-container transition-all font-mono-sm outline-none"
                  required
                />
              </div>

              {/* Reason */}
              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md text-on-surface-variant uppercase">Motivo</label>
                <div className="relative">
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-surface-container border-none rounded-lg py-md pl-md pr-10 text-body-md text-on-surface focus:ring-2 focus:ring-secondary-container transition-all appearance-none cursor-pointer outline-none"
                  >
                    <option value="miscount">Error de Conteo (Inventario)</option>
                    <option value="damage">Deterioro / Daño</option>
                    <option value="theft">Robo / Pérdida</option>
                    <option value="return">Devolución no registrada</option>
                    <option value="other">Otro</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-md top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
                </div>
              </div>

              {/* Internal Note */}
              <div className="flex flex-col gap-xs md:col-span-2">
                <label className="font-label-md text-label-md text-on-surface-variant uppercase">Nota Interna (Opcional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Detalles adicionales sobre este ajuste..."
                  rows={3}
                  className="w-full bg-surface-container border-none rounded-lg py-md px-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary-container transition-all resize-none outline-none"
                ></textarea>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-md mt-md flex justify-end gap-md relative border-t border-surface-container-high">
              <button
                type="button"
                onClick={() => onNavigate('inventario')}
                className="px-lg py-md rounded-lg font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-lg py-md rounded-lg bg-secondary text-on-secondary font-label-md text-label-md hover:bg-secondary-container hover:text-on-secondary-container hover:shadow-md transition-all flex items-center gap-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">save</span>
                Aplicar Ajuste
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="absolute bottom-lg right-lg text-mono-sm font-mono-sm text-outline opacity-50 flex flex-col items-end pointer-events-none">
        <span>NEXUS_ERP_MOD_INV_ADJ</span>
        <span>SYS_TIME: {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
};
