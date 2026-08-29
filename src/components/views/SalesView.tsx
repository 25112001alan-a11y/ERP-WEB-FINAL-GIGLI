import React, { useState } from 'react';
import { ViewPath, SaleTransaction } from '../../types';

interface SalesViewProps {
  sales: SaleTransaction[];
  onNavigate: (view: ViewPath) => void;
}

export const SalesView: React.FC<SalesViewProps> = ({ sales, onNavigate }) => {
  const [selectedSale, setSelectedSale] = useState<SaleTransaction | null>(sales[0] || null);

  const now = new Date();
  const monthSales = sales.filter((s) => {
    const d = s.createdAt ? new Date(s.createdAt) : new Date(0);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalMonth = monthSales.reduce((acc, s) => acc + s.amount, 0);
  const receivables = sales.filter((s) => s.paymentStatus !== 'Pagado').reduce((acc, s) => acc + s.amount, 0);
  const receivablesCount = sales.filter((s) => s.paymentStatus !== 'Pagado').length;
  const fulfillmentRate = sales.length > 0 ? Math.round((sales.filter((s) => s.fulfillmentStatus === 'Entregado').length / sales.length) * 1000) / 10 : 0;

  return (
    <div className="flex flex-col w-full h-full relative" id="sales-root">
      {/* Metrics Summary Section */}
      <div className="w-full flex gap-lg relative mb-xl flex-col md:flex-row">
        {/* Sales Overview Card */}
        <div className="flex-1 bg-surface-container-low p-lg rounded-xl flex flex-col gap-md shadow-sm border border-outline-variant/20 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>
          <div className="flex justify-between items-start z-10">
            <div className="flex flex-col">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest">Ingresos Totales (Mes)</span>
              <span className="font-display-lg text-display-lg text-on-surface mt-sm">${totalMonth.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
            </div>
          </div>
          <div className="flex items-center gap-sm mt-auto z-10">
            <span className="font-body-md text-body-md text-on-surface-variant">{monthSales.length} {monthSales.length === 1 ? 'transacción' : 'transacciones'} en el mes</span>
          </div>
        </div>

        {/* Pending Invoices Card */}
        <div className="flex-1 bg-error-container/30 p-lg rounded-xl flex flex-col gap-md shadow-sm border border-error-container/50">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="font-label-md text-label-md text-on-error-container uppercase tracking-widest">Cuentas por Cobrar</span>
              <span className="font-display-lg text-display-lg text-on-surface mt-sm">${receivables.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">schedule</span>
            </div>
          </div>
          <div className="flex items-center gap-sm mt-auto">
            <span className="font-body-md text-body-md text-on-error-container font-semibold">{receivablesCount}</span>
            <span className="font-body-md text-body-md text-on-surface-variant">comprobantes sin pago registrado</span>
          </div>
        </div>

        {/* Fulfillment Card */}
        <div className="flex-1 bg-surface-container p-lg rounded-xl flex flex-col gap-md shadow-sm border border-outline-variant/20">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest">Tasa de Cumplimiento</span>
              <span className="font-display-lg text-display-lg text-on-surface mt-sm">{fulfillmentRate}%</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
            </div>
          </div>
          <div className="w-full h-2 bg-surface-variant rounded-full overflow-hidden mt-auto">
            <div className="h-full bg-secondary rounded-full" style={{ width: `${fulfillmentRate}%` }}></div>
          </div>
        </div>
      </div>

      {/* Split View Content */}
      <div className="flex gap-lg w-full h-[calc(100vh-280px)] min-h-[500px]">
        {/* Table Panel */}
        <div className="flex-1 bg-surface-container-lowest rounded-xl shadow-sm flex flex-col overflow-hidden relative border border-outline-variant/30">
          {/* Toolbar */}
          <div className="flex items-center justify-between p-md bg-surface-container-lowest z-10 border-b border-surface-container-high">
            <div className="flex items-center gap-sm">
              <span className="font-headline-md text-headline-md text-on-surface">Historial de Ventas</span>
              <span className="font-mono-sm text-mono-sm text-on-surface-variant bg-surface-container-low px-sm py-xs rounded-full ml-sm">
                {sales.length} Registros
              </span>
            </div>
            <div className="flex items-center gap-md">
              <button
                onClick={() => onNavigate('pos')}
                className="flex items-center gap-xs px-md py-[6px] bg-secondary text-on-secondary rounded font-label-md text-label-md hover:opacity-90 transition-opacity shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Nueva Venta
              </button>
            </div>
          </div>

          {/* Sales Table */}
          <div className="flex-1 overflow-auto bg-surface-container-lowest">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-surface-container-low z-10">
                <tr>
                  <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase whitespace-nowrap w-32">Fecha</th>
                  <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase whitespace-nowrap w-24">ID Pedido</th>
                  <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase min-w-[180px]">Cliente</th>
                  <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase text-right w-24">Total</th>
                  <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase text-center w-32">Estado Pago</th>
                  <th className="py-sm px-md font-label-md text-label-md text-on-surface-variant uppercase text-center w-32">Cumplimiento</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface divide-y divide-surface-variant/50">
                {sales.map((sale) => {
                  const isSelected = selectedSale?.id === sale.id;
                  return (
                    <tr
                      key={sale.id}
                      onClick={() => setSelectedSale(sale)}
                      className={`hover:bg-surface-container-low transition-colors cursor-pointer relative ${
                        isSelected ? 'bg-secondary-container/10' : ''
                      }`}
                    >
                      <td className="py-sm px-md whitespace-nowrap">
                        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-secondary"></div>}
                        {sale.date}
                      </td>
                      <td className="py-sm px-md font-mono-sm text-primary font-bold">{sale.id}</td>
                      <td className="py-sm px-md">
                        <div className="flex items-center gap-sm">
                          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface font-label-md">
                            {sale.clientName.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold truncate w-44">{sale.clientName}</span>
                            <span className="text-mono-sm text-on-surface-variant">{sale.clientType}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-sm px-md text-right font-mono-sm font-semibold">${sale.amount.toFixed(2)}</td>
                      <td className="py-sm px-md text-center">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-label-md font-label-md gap-xs ${
                            sale.paymentStatus === 'Pagado'
                              ? 'bg-tertiary-fixed-dim/20 text-on-tertiary-fixed-variant'
                              : sale.paymentStatus === 'Vencido'
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-surface-container-high text-on-surface-variant'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              sale.paymentStatus === 'Pagado'
                                ? 'bg-tertiary'
                                : sale.paymentStatus === 'Vencido'
                                ? 'bg-error'
                                : 'bg-outline'
                            }`}
                          ></span>
                          {sale.paymentStatus}
                        </span>
                      </td>
                      <td className="py-sm px-md text-center">
                        <span className="inline-flex items-center px-2 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-label-md font-label-md">
                          {sale.fulfillmentStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Details Panel */}
        {selectedSale && (
          <div className="w-[400px] bg-surface-container-lowest rounded-xl shadow-md flex flex-col overflow-hidden shrink-0 border border-outline-variant/30 relative">
            <div className="h-20 bg-gradient-to-br from-primary-container to-primary relative overflow-hidden flex items-end p-md">
              <div className="z-10 flex justify-between items-end w-full">
                <div className="flex flex-col text-on-primary">
                  <span className="font-mono-sm text-mono-sm opacity-80 uppercase tracking-wider">Venta #</span>
                  <span className="font-headline-lg text-headline-lg leading-none">{selectedSale.id}</span>
                </div>
                <button onClick={() => setSelectedSale(null)} className="text-on-primary hover:opacity-80">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-md flex flex-col gap-lg bg-surface-container-lowest">
              <div className="flex justify-between items-center p-sm bg-surface-container-low rounded-lg shadow-sm">
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface-variant">Cliente</span>
                  <span className="font-body-md text-body-md text-on-surface font-semibold truncate w-32">{selectedSale.clientName}</span>
                </div>
                <div className="h-8 w-px bg-outline-variant/30"></div>
                <div className="flex flex-col text-right">
                  <span className="font-label-md text-label-md text-on-surface-variant">Monto Total</span>
                  <span className="font-body-md text-body-md text-primary font-bold">${selectedSale.amount.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-xs">
                <h3 className="font-headline-md text-headline-md text-on-surface">Detalle de Líneas</h3>
                <div className="border border-outline-variant/30 rounded-lg overflow-hidden mt-sm">
                  <table className="w-full text-left">
                    <thead className="bg-surface-container font-label-md text-label-md text-on-surface-variant uppercase">
                      <tr>
                        <th className="py-2 px-sm">Descripción</th>
                        <th className="py-2 px-sm text-right w-16">Cant</th>
                        <th className="py-2 px-sm text-right w-24">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="font-body-md text-body-md text-on-surface divide-y divide-surface-variant/50 bg-surface-container-lowest">
                      {(selectedSale.items ?? []).map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-sm">
                            <div className="flex flex-col">
                              <span className="truncate w-36 font-medium">{item.description}</span>
                            </div>
                          </td>
                          <td className="py-2 px-sm text-right">{item.quantity}</td>
                          <td className="py-2 px-sm text-right font-mono-sm">${(item.quantity * item.unitPrice).toFixed(2)}</td>
                        </tr>
                      ))}
                      {selectedSale.itemsCount > 0 && (!selectedSale.items || selectedSale.items.length === 0) && (
                        <tr>
                          <td colSpan={3} className="py-2 px-sm text-on-surface-variant text-center">
                            {selectedSale.itemsCount} ítem{selectedSale.itemsCount > 1 ? 's' : ''} sin detalle cargado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-md bg-surface p-md rounded-lg border border-outline-variant/30">
                <span className="material-symbols-outlined text-outline">local_shipping</span>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase">Estado Cumplimiento</span>
                  <span className="font-body-md text-body-md text-on-surface font-semibold">{selectedSale.fulfillmentStatus}</span>
                  <span className="font-mono-sm text-mono-sm text-on-surface-variant mt-1">Método Pago: {selectedSale.paymentMethod}</span>
                </div>
              </div>
            </div>

            <div className="p-md bg-surface-container-low border-t border-outline-variant/30 flex flex-col gap-sm">
              <button
                onClick={() => alert(`Factura generada para ${selectedSale.id}`)}
                className="w-full py-2 bg-secondary text-on-secondary rounded font-label-md text-label-md flex items-center justify-center gap-sm hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                Generar Factura (PDF)
              </button>
              <div className="flex gap-sm">
                <button onClick={() => window.print()} className="flex-1 py-2 bg-transparent text-on-surface border border-outline-variant rounded font-label-md text-label-md flex items-center justify-center gap-xs hover:bg-surface-variant transition-colors cursor-pointer">
                  <span className="material-symbols-outlined text-[16px]">print</span>
                  Imprimir
                </button>
                <button onClick={() => alert('Venta anulada')} className="flex-1 py-2 bg-transparent text-error border border-error/50 rounded font-label-md text-label-md flex items-center justify-center gap-xs hover:bg-error-container transition-colors cursor-pointer">
                  <span className="material-symbols-outlined text-[16px]">cancel</span>
                  Anular
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
