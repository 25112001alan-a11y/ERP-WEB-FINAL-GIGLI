import React, { useState } from 'react';
import { ViewPath, Supplier, Product, WarehouseOption } from '../../types';

interface NewPurchaseOrderViewProps {
  suppliers: Supplier[];
  products: Product[];
  warehouses: WarehouseOption[];
  onCreateOrder: (payload: {
    supplierId: number;
    items: { productId: number; quantity: number; unitPrice: number }[];
    warehouseId?: number;
    notes?: string;
  }) => Promise<void>;
  onNavigate: (view: ViewPath) => void;
}

interface Line {
  id: string;
  productId: number | null;
  sku: string;
  name: string;
  qty: number;
  unitCost: number;
}

export const NewPurchaseOrderView: React.FC<NewPurchaseOrderViewProps> = ({
  suppliers,
  products,
  warehouses,
  onCreateOrder,
  onNavigate,
}) => {
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { id: '1', productId: null, sku: '', name: '', qty: 1, unitCost: 0 },
  ]);
  const [warehouse, setWarehouse] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: Date.now().toString(), productId: null, sku: '', name: '', qty: 1, unitCost: 0 },
    ]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  };

  const pickProduct = (lineId: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, productId: Number(productId), sku: `${product.sku} — ${product.name}`, name: product.name, unitCost: product.costPrice }
          : l,
      ),
    );
  };

  const subtotal = lines.reduce((acc, l) => acc + l.qty * l.unitCost, 0);
  const tax = subtotal * 0.16;
  const total = subtotal + tax;

  const handleSave = async () => {
    setError('');
    if (!selectedSupplier) {
      setError('Seleccione un proveedor.');
      return;
    }
    const invalid = lines.filter((l) => !l.productId || l.qty < 1);
    if (invalid.length > 0) {
      setError('Complete todas las líneas: elija producto y cantidad válida.');
      return;
    }
    setSaving(true);
    try {
      await onCreateOrder({
        supplierId: Number(selectedSupplier),
        items: lines.map((l) => ({ productId: l.productId!, quantity: l.qty, unitPrice: l.unitCost })),
        warehouseId: warehouse ? Number(warehouse) : undefined,
        notes: notes || undefined,
      });
      setSaved(true);
      setTimeout(() => {
        onNavigate('compras');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la orden de compra.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full p-lg gap-lg font-body-md text-on-surface">
      <header className="flex items-center justify-between pb-sm border-b border-outline-variant/30">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">Nueva Orden de Compra</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">Módulo de Compras / Creación de PO</p>
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
            className="px-md py-sm rounded-lg bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity shadow-md flex items-center gap-sm cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            {saving ? 'Guardando...' : 'Guardar Orden'}
          </button>
        </div>
      </header>

      {saved ? (
        <div className="p-xl text-center py-20 bg-surface-container-lowest rounded-xl shadow-md border border-outline-variant/30 flex flex-col items-center gap-md">
          <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">check_circle</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Orden de Compra Generada</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">La PO se ha guardado correctamente. Redirigiendo a compras...</p>
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
              {/* Supplier Info */}
              <section className="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20 relative overflow-hidden">
                <h2 className="font-headline-md text-headline-md mb-md flex items-center gap-sm text-primary">
                  <span className="material-symbols-outlined">storefront</span>
                  Información del Proveedor
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md relative z-10">
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Proveedor</label>
                    <select
                      value={selectedSupplier}
                      onChange={(e) => setSelectedSupplier(e.target.value)}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary transition-all font-body-md text-on-surface outline-none cursor-pointer"
                    >
                      <option value="">Seleccione un proveedor...</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.contactPerson || 'sin contacto'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Contacto Principal</label>
                    <input
                      type="text"
                      disabled
                      value={
                        selectedSupplier
                          ? (suppliers.find((s) => s.id === selectedSupplier)?.contactPerson ?? '')
                          : 'Seleccione un proveedor primero'
                      }
                      className="w-full bg-surface-container-low px-md py-sm rounded-lg border border-outline-variant/30 text-on-surface-variant/70 font-body-md cursor-not-allowed"
                    />
                  </div>
                </div>
              </section>

              {/* Product Lines */}
              <section className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 overflow-hidden">
                <div className="p-lg border-b border-outline-variant/20 flex items-center justify-between bg-surface-container/30">
                  <h2 className="font-headline-md text-headline-md flex items-center gap-sm text-primary">
                    <span className="material-symbols-outlined">inventory_2</span>
                    Líneas de Productos
                  </h2>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-primary hover:bg-primary/10 px-sm py-xs rounded flex items-center gap-xs font-label-md text-label-md transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Añadir Línea
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant/20">
                        <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider w-12">#</th>
                        <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider w-2/5">Artículo / SKU</th>
                        <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider w-32">Cantidad</th>
                        <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider w-32">Costo Unit.</th>
                        <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right">Total Línea</th>
                        <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="font-body-md">
                      {lines.map((line, idx) => {
                        const lineTotal = line.qty * line.unitCost;
                        return (
                          <tr key={line.id} className="border-b border-outline-variant/10 hover:bg-surface-container/20 transition-colors group">
                            <td className="py-md px-md text-on-surface-variant font-mono-sm text-mono-sm">0{idx + 1}</td>
                            <td className="py-md px-md">
                              <select
                                value={line.productId != null ? String(line.productId) : ''}
                                onChange={(e) => pickProduct(line.id, e.target.value)}
                                className="w-full bg-surface border border-outline-variant/30 rounded px-sm py-xs focus:border-primary outline-none cursor-pointer"
                              >
                                <option value="">Buscar producto...</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.sku} — {p.name} (stock: {p.stock})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-md px-md">
                              <input
                                type="number"
                                min="1"
                                value={line.qty}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, qty: val } : l)));
                                }}
                                className="w-full bg-surface border border-outline-variant/30 rounded px-sm py-xs focus:border-primary outline-none"
                              />
                            </td>
                            <td className="py-md px-md">
                              <div className="relative flex items-center">
                                <span className="absolute left-sm text-on-surface-variant">$</span>
                                <input
                                  type="number"
                                  value={line.unitCost}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, unitCost: val } : l)));
                                  }}
                                  className="w-full bg-surface border border-outline-variant/30 rounded pl-lg pr-sm py-xs focus:border-primary outline-none"
                                />
                              </div>
                            </td>
                            <td className="py-md px-md text-right font-mono-sm text-mono-sm text-on-surface">
                              ${lineTotal.toFixed(2)}
                            </td>
                            <td className="py-md px-md text-center">
                              <button
                                type="button"
                                onClick={() => removeLine(line.id)}
                                className="text-outline-variant hover:text-error transition-colors p-xs rounded cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Notes */}
              <section className="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
                <h2 className="font-headline-md text-headline-md mb-md flex items-center gap-sm text-primary">
                  <span className="material-symbols-outlined">edit_note</span>
                  Notas y Condiciones
                </h2>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instrucciones especiales, condiciones de pago..."
                  rows={3}
                  className="w-full bg-surface border border-outline-variant/50 rounded-lg p-md focus:border-primary outline-none resize-none font-body-md"
                ></textarea>
              </section>
            </div>

            {/* Right Column Summary */}
            <div className="lg:col-span-1 space-y-lg flex flex-col h-full">
              <section className="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
                <h2 className="font-headline-md text-headline-md mb-md flex items-center gap-sm text-primary">
                  <span className="material-symbols-outlined">local_shipping</span>
                  Detalles de Logística
                </h2>
                <div className="space-y-md">
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Almacén Destino</label>
                    <select
                      value={warehouse}
                      onChange={(e) => setWarehouse(e.target.value)}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none cursor-pointer"
                    >
                      <option value="">Seleccione un depósito...</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="bg-primary text-on-primary p-lg rounded-xl shadow-md border-t-4 border-secondary-container mt-auto relative overflow-hidden">
                <h2 className="font-headline-md text-headline-md mb-lg flex items-center gap-sm">
                  <span className="material-symbols-outlined">receipt_long</span>
                  Resumen de Orden
                </h2>
                <div className="space-y-md font-body-md">
                  <div className="flex justify-between items-center border-b border-on-primary/10 pb-sm">
                    <span className="text-on-primary/70">Subtotal</span>
                    <span className="font-mono-sm">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-on-primary/10 pb-sm">
                    <span className="text-on-primary/70">Impuestos (estimado)</span>
                    <span className="font-mono-sm">${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-end pt-sm">
                    <span className="font-headline-md text-headline-md uppercase tracking-wider">Total PO</span>
                    <span className="font-display-lg text-display-lg font-bold tracking-tight text-secondary-fixed-dim">
                      ${total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
};