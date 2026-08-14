import React, { useState } from 'react';
import { ViewPath } from '../../types';

interface NewManualOrderViewProps {
  onNavigate: (view: ViewPath) => void;
}

export const NewManualOrderView: React.FC<NewManualOrderViewProps> = ({ onNavigate }) => {
  const [clientSearch, setClientSearch] = useState('Carlos Aranda');
  const [lines, setLines] = useState([
    { id: '1', name: 'Licencia Anual Nexus Pro', qty: 1, price: 1200000, discount: 0 },
    { id: '2', name: 'SOPORTE PREMIUM (Horas)', qty: 10, price: 35000, discount: 10 },
  ]);
  const [address, setAddress] = useState('Av. Providencia 1234, Dpto 502, Santiago');
  const [paymentCondition, setPaymentCondition] = useState('transfer');
  const [saved, setSaved] = useState(false);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: Date.now().toString(), name: 'Producto / Servicio Nuevo', qty: 1, price: 50000, discount: 0 },
    ]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const subtotalNeto = lines.reduce((acc, l) => {
    const itemSub = l.qty * l.price * (1 - l.discount / 100);
    return acc + itemSub;
  }, 0);

  const iva = subtotalNeto * 0.19;
  const total = subtotalNeto + iva;

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => {
      onNavigate('pedidos-publicos');
    }, 1500);
  };

  return (
    <div className="flex flex-col w-full h-full">
      {/* Top Header */}
      <div className="px-xl py-lg flex items-center justify-between sticky top-0 bg-surface/90 backdrop-blur-md z-10 shadow-sm border-b border-outline-variant/20">
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
        <div className="flex items-center gap-md">
          <button
            onClick={() => onNavigate('pedidos-publicos')}
            className="px-md py-2 rounded text-body-md font-semibold text-surface-tint border border-outline-variant hover:bg-surface-container-highest transition-colors cursor-pointer"
          >
            Descartar
          </button>
          <button
            onClick={handleSave}
            className="px-md py-2 rounded text-body-md font-semibold bg-secondary text-on-secondary hover:bg-secondary/90 transition-colors shadow-sm flex items-center gap-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            Guardar Pedido
          </button>
        </div>
      </div>

      {saved ? (
        <div className="p-xl text-center py-20 bg-surface-container-lowest m-xl rounded-xl shadow-md border border-outline-variant/30 flex flex-col items-center gap-md">
          <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">check_circle</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Pedido Registrado Con Éxito</h2>
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
                  <label className="text-label-md text-on-surface-variant uppercase tracking-wider">Buscar Cliente *</label>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">search</span>
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Nombre, RUT o Email..."
                      className="w-full bg-surface border border-outline-variant rounded-md py-sm pl-10 pr-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Order Lines Section */}
            <section className="bg-surface-container-lowest rounded-xl shadow-sm p-lg border border-outline-variant/20">
              <div className="flex items-center justify-between mb-md">
                <h2 className="text-headline-md font-headline-md text-on-surface flex items-center gap-sm">
                  <span className="material-symbols-outlined text-primary">list_alt</span>
                  Líneas de Pedido
                </h2>
                <button
                  type="button"
                  onClick={addLine}
                  className="text-label-md font-semibold text-secondary flex items-center gap-xs hover:bg-secondary/10 px-sm py-xs rounded transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Agregar Producto
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-surface-container-high">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-surface-container-low text-label-md text-on-surface-variant uppercase tracking-wider border-b border-surface-container-high">
                      <th className="p-sm font-semibold w-12 text-center"></th>
                      <th className="p-sm font-semibold">Producto / Servicio</th>
                      <th className="p-sm font-semibold w-24 text-right">Cant.</th>
                      <th className="p-sm font-semibold w-36 text-right">Precio Unit.</th>
                      <th className="p-sm font-semibold w-24 text-right">% Desc.</th>
                      <th className="p-sm font-semibold w-36 text-right">Subtotal</th>
                      <th className="p-sm font-semibold w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="text-body-md text-on-surface divide-y divide-surface-container-high">
                    {lines.map((line) => {
                      const sub = line.qty * line.price * (1 - line.discount / 100);
                      return (
                        <tr key={line.id} className="hover:bg-surface/50 transition-colors group">
                          <td className="p-sm text-center">
                            <span className="material-symbols-outlined text-outline-variant cursor-grab hover:text-on-surface">drag_indicator</span>
                          </td>
                          <td className="p-sm">
                            <input
                              type="text"
                              value={line.name}
                              onChange={(e) => {
                                const newName = e.target.value;
                                setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, name: newName } : l)));
                              }}
                              className="w-full bg-transparent border-none p-xs focus:ring-0 text-body-md font-medium text-on-surface outline-none"
                            />
                          </td>
                          <td className="p-sm">
                            <input
                              type="number"
                              min="1"
                              value={line.qty}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, qty: val } : l)));
                              }}
                              className="w-full bg-surface border border-outline-variant rounded p-xs text-right text-body-md focus:border-primary outline-none"
                            />
                          </td>
                          <td className="p-sm relative">
                            <span className="absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant/70 text-sm">$</span>
                            <input
                              type="number"
                              value={line.price}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, price: val } : l)));
                              }}
                              className="w-full bg-surface border border-outline-variant rounded p-xs pl-6 text-right text-body-md focus:border-primary outline-none font-mono-sm"
                            />
                          </td>
                          <td className="p-sm">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={line.discount}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, discount: val } : l)));
                              }}
                              className="w-full bg-surface border border-outline-variant rounded p-xs text-right text-body-md focus:border-primary outline-none"
                            />
                          </td>
                          <td className="p-sm text-right font-mono-sm font-semibold">
                            ${sub.toLocaleString('es-CL')}
                          </td>
                          <td className="p-sm text-center">
                            <button
                              type="button"
                              onClick={() => removeLine(line.id)}
                              className="text-error/70 hover:text-error hover:bg-error-container/50 p-xs rounded transition-colors cursor-pointer"
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
            </section>

            {/* Shipping Info */}
            <section className="bg-surface-container-lowest rounded-xl shadow-sm p-lg border border-outline-variant/20">
              <h2 className="text-headline-md font-headline-md text-on-surface mb-md flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary">local_shipping</span>
                Información de Envío / Logística
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <div className="flex flex-col gap-xs md:col-span-2">
                  <label className="text-label-md text-on-surface-variant uppercase tracking-wider">Dirección de Entrega</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={2}
                    className="w-full bg-surface border border-outline-variant rounded-md p-sm text-body-md text-on-surface focus:outline-none focus:border-primary transition-all resize-none"
                  ></textarea>
                </div>
              </div>
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
                  <span className="font-mono-sm">-$0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">IVA (19%)</span>
                  <span className="font-mono-sm">${iva.toLocaleString('es-CL')}</span>
                </div>
              </div>

              <div className="flex justify-between items-end mb-lg">
                <span className="text-body-lg font-semibold text-on-surface">Total</span>
                <span className="text-display-lg font-display-lg text-primary tracking-tight font-mono-sm">
                  ${total.toLocaleString('es-CL')}
                </span>
              </div>

              <div className="space-y-md">
                <div className="flex flex-col gap-xs">
                  <label className="text-label-md text-on-surface-variant uppercase tracking-wider">Condición de Pago</label>
                  <select
                    value={paymentCondition}
                    onChange={(e) => setPaymentCondition(e.target.value)}
                    className="w-full bg-surface border border-outline-variant rounded-md p-sm text-body-md text-on-surface focus:outline-none focus:border-primary cursor-pointer outline-none"
                  >
                    <option value="transfer">Transferencia Bancaria a 30 días</option>
                    <option value="credit">Tarjeta de Crédito</option>
                    <option value="cash">Efectivo / Contado</option>
                  </select>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
