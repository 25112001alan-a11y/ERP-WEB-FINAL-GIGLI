import React, { useState } from 'react';
import { ViewPath, Product } from '../../types';
import { apiFetch } from '../../lib/api';

interface NewManualOrderViewProps {
  products: Product[];
  onNavigate: (view: ViewPath) => void;
}

interface OrderLine {
  id: string;
  productId: string;
  qty: number;
  price: number;
  discountPct: number;
}

export const NewManualOrderView: React.FC<NewManualOrderViewProps> = ({ products, onNavigate }) => {
  const [clientSearch, setClientSearch] = useState('');
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const addLine = () => {
    const first = products[0];
    if (!first) return;
    setLines((prev) => [
      ...prev,
      { id: Date.now().toString(), productId: first.id, qty: 1, price: first.price, discountPct: 0 },
    ]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, patch: Partial<OrderLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const taxRateOf = (line: OrderLine): number =>
    products.find((p) => p.id === line.productId)?.taxRate ?? 0;

  const subtotalNeto = lines.reduce((acc, l) => {
    const gross = l.qty * l.price;
    return acc + (gross - (gross * l.discountPct) / 100);
  }, 0);

  const totalTax = lines.reduce((acc, l) => {
    const gross = l.qty * l.price;
    const neto = gross - (gross * l.discountPct) / 100;
    return acc + (neto * taxRateOf(l)) / 100;
  }, 0);

  const totalDiscount = lines.reduce((acc, l) => {
    const gross = l.qty * l.price;
    return acc + (gross * l.discountPct) / 100;
  }, 0);

  const total = subtotalNeto + totalTax;

  const handleSave = async () => {
    setError(null);
    const clientName = clientSearch.trim();
    if (!clientName) {
      setError('Ingresá el nombre del cliente.');
      return;
    }
    const validLines = lines.filter((l) => l.productId && l.qty > 0);
    if (validLines.length === 0) {
      setError('Agregá al menos un producto con cantidad mayor a cero.');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/api/documents', {
        method: 'POST',
        body: {
          type: 'PEDIDO',
          series: 'A',
          clientName,
          notes: notes.trim() || undefined,
          items: validLines.map((l) => {
            const gross = l.qty * l.price;
            return {
              productId: Number(l.productId),
              quantity: l.qty,
              unitPrice: l.price,
              discount: Math.round((gross * l.discountPct) / 100),
            };
          }),
        },
      });
      setSaved(true);
      setTimeout(() => onNavigate('pedidos-publicos'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el pedido');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full">
      {/* Top Header */}
      <div className="px-xl py-lg flex items-center justify-between sticky top-0 bg-surface/90 backdrop-blur-md z-10 shadow-sm border-b border-outline-variant/20 flex-wrap gap-md">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-xs">
            <button onClick={() => onNavigate('pedidos-publicos')} className="hover:text-primary transition-colors cursor-pointer">
              Pedidos Públicos
            </button>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="text-on-surface font-semibold">Nuevo Pedido Manual</span>
          </nav>
          <h1 className="text-headline-lg font-headline-lg text-on-surface tracking-tight">Nuevo Pedido Manual</h1>
        </div>
        <div className="flex items-center gap-md flex-wrap">
          <button
            onClick={() => onNavigate('pedidos-publicos')}
            className="px-md py-2 rounded text-body-md font-semibold text-surface-tint border border-outline-variant hover:bg-surface-container-highest transition-colors cursor-pointer"
          >
            Descartar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-md py-2 rounded text-body-md font-semibold bg-secondary text-on-secondary hover:bg-secondary/90 transition-colors shadow-sm flex items-center gap-sm cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            {saving ? 'Guardando...' : 'Guardar Pedido'}
          </button>
        </div>
      </div>

      {saved ? (
        <div className="p-xl text-center py-20 bg-surface-container-lowest m-xl rounded-xl shadow-md border border-outline-variant/30 flex flex-col items-center gap-md">
          <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">check_circle</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Pedido Registrado</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Redirigiendo a la gestión de pedidos públicos...</p>
        </div>
      ) : (
        <div className="p-xl grid grid-cols-12 gap-xl relative h-full">
          {/* Left Column */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-lg">
            {/* Customer Info Section */}
            <section className="bg-surface-container-lowest rounded-xl shadow-sm p-lg relative overflow-hidden border border-outline-variant/20">
              <h2 className="text-headline-md font-headline-md text-on-surface mb-md flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary">person_search</span>
                Información del Cliente
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md relative z-10">
                <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                  <label className="text-label-md text-on-surface-variant uppercase tracking-wider">Cliente *</label>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">search</span>
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Nombre del cliente (se crea si no existe)"
                      className="w-full bg-surface border border-outline-variant rounded-md py-sm pl-10 pr-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Order Lines Section */}
            <section className="bg-surface-container-lowest rounded-xl shadow-sm p-lg border border-outline-variant/20">
              <div className="flex items-center justify-between mb-md flex-wrap gap-md">
                <h2 className="text-headline-md font-headline-md text-on-surface flex items-center gap-sm">
                  <span className="material-symbols-outlined text-primary">list_alt</span>
                  Líneas de Pedido
                </h2>
                <button
                  type="button"
                  onClick={addLine}
                  disabled={products.length === 0}
                  className="text-label-md font-semibold text-secondary flex items-center gap-xs hover:bg-secondary/10 px-sm py-xs rounded transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Agregar Producto
                </button>
              </div>

              {products.length === 0 ? (
                <p className="text-body-md text-on-surface-variant text-center py-8">
                  No hay productos en el catálogo. Creá uno desde Inventario para registrar pedidos.
                </p>
              ) : lines.length === 0 ? (
                <p className="text-body-md text-on-surface-variant text-center py-8">
                  Agregá productos para armar el pedido.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-surface-container-high">
                  <table className="w-full text-left border-collapse min-w-[760px]">
                    <thead>
                      <tr className="bg-surface-container-low text-label-md text-on-surface-variant uppercase tracking-wider border-b border-surface-container-high">
                        <th className="p-sm font-semibold">Producto</th>
                        <th className="p-sm font-semibold w-24 text-right">Cant.</th>
                        <th className="p-sm font-semibold w-36 text-right">Precio Unit.</th>
                        <th className="p-sm font-semibold w-24 text-right">% Desc.</th>
                        <th className="p-sm font-semibold w-28 text-right">IVA</th>
                        <th className="p-sm font-semibold w-36 text-right">Subtotal</th>
                        <th className="p-sm font-semibold w-12 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="text-body-md text-on-surface divide-y divide-surface-container-high">
                      {lines.map((line) => {
                        const gross = line.qty * line.price;
                        const neto = gross - (gross * line.discountPct) / 100;
                        const tax = (neto * taxRateOf(line)) / 100;
                        return (
                          <tr key={line.id} className="hover:bg-surface/50 transition-colors group">
                            <td className="p-sm">
                              <select
                                value={line.productId}
                                onChange={(e) => {
                                  const product = products.find((p) => p.id === e.target.value);
                                  updateLine(line.id, {
                                    productId: e.target.value,
                                    price: product?.price ?? line.price,
                                  });
                                }}
                                className="w-full bg-transparent border-b border-outline-variant/40 p-xs text-body-md font-medium text-on-surface outline-none focus:border-primary"
                              >
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} — {p.sku || `#${p.id}`}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-sm">
                              <input
                                type="number"
                                min="1"
                                value={line.qty}
                                onChange={(e) => updateLine(line.id, { qty: Number(e.target.value) })}
                                className="w-full bg-surface border border-outline-variant rounded p-xs text-right text-body-md focus:border-primary outline-none"
                              />
                            </td>
                            <td className="p-sm">
                              <input
                                type="number"
                                min="0"
                                value={line.price}
                                onChange={(e) => updateLine(line.id, { price: Number(e.target.value) })}
                                className="w-full bg-surface border border-outline-variant rounded p-xs text-right text-body-md focus:border-primary outline-none font-mono-sm"
                              />
                            </td>
                            <td className="p-sm">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={line.discountPct}
                                onChange={(e) => updateLine(line.id, { discountPct: Number(e.target.value) })}
                                className="w-full bg-surface border border-outline-variant rounded p-xs text-right text-body-md focus:border-primary outline-none"
                              />
                            </td>
                            <td className="p-sm text-right text-on-surface-variant text-sm">{taxRateOf(line)}%</td>
                            <td className="p-sm text-right font-mono-sm font-semibold">
                              ${(neto + tax).toLocaleString('es-CL')}
                            </td>
                            <td className="p-sm text-center">
                              <button
                                type="button"
                                onClick={() => removeLine(line.id)}
                                className="text-error/70 hover:text-error hover:bg-error-container/50 p-xs rounded transition-colors cursor-pointer tap-target"
                              >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Notes */}
            <section className="bg-surface-container-lowest rounded-xl shadow-sm p-lg border border-outline-variant/20">
              <h2 className="text-headline-md font-headline-md text-on-surface mb-md flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary">notes</span>
                Notas
              </h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Condiciones acordadas, referencias, observaciones..."
                className="w-full bg-surface border border-outline-variant rounded-md p-sm text-body-md text-on-surface focus:outline-none focus:border-primary transition-all resize-none"
              ></textarea>
            </section>
          </div>

          {/* Right Column Summary */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-lg lg:sticky lg:top-24 self-start">
            <section className="bg-surface-container-lowest rounded-xl shadow-sm p-lg border-t-4 border-primary border-x border-b border-outline-variant/20">
              <h3 className="text-headline-md font-headline-md text-on-surface mb-md">Resumen del Pedido</h3>
              <div className="flex flex-col gap-sm text-body-md text-on-surface mb-md pb-md border-b border-surface-container-high">
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">Subtotal Neto</span>
                  <span className="font-mono-sm">${subtotalNeto.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between items-center text-error">
                  <span>Descuentos</span>
                  <span className="font-mono-sm">-${totalDiscount.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">IVA total</span>
                  <span className="font-mono-sm">${totalTax.toLocaleString('es-CL')}</span>
                </div>
              </div>

              <div className="flex justify-between items-end mb-lg">
                <span className="text-body-lg font-semibold text-on-surface">Total</span>
                <span className="text-display-lg font-display-lg text-primary tracking-tight font-mono-sm">
                  ${total.toLocaleString('es-CL')}
                </span>
              </div>

              {error && (
                <p className="text-error text-sm bg-error-container/30 rounded p-sm mb-md">{error}</p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};