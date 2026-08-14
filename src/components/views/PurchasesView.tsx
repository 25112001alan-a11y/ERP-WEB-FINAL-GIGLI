import React, { useState } from 'react';
import { ViewPath, PurchaseOrder, Supplier } from '../../types';

interface PurchasesViewProps {
  orders: PurchaseOrder[];
  suppliers: Supplier[];
  onNavigate: (view: ViewPath) => void;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({ orders, suppliers, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'po' | 'suppliers'>('po');
  const [poSearch, setPoSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');

  const filteredOrders = orders.filter(
    (o) =>
      o.id.toLowerCase().includes(poSearch.toLowerCase()) ||
      o.supplier.toLowerCase().includes(poSearch.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col w-full h-full gap-lg">
      {/* Header Section */}
      <div className="flex flex-col gap-sm bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
        <div className="flex items-start justify-between flex-wrap gap-md">
          <div className="flex flex-col gap-base">
            <h1 className="font-display-lg text-display-lg text-on-surface">Compras y Proveedores</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">Gestión de órdenes de compra, seguimiento de recepción y directorio de proveedores.</p>
          </div>
          <div className="flex gap-md flex-wrap">
            <button
              onClick={() => onNavigate('registrar-remito')}
              className="flex items-center gap-sm px-md py-sm bg-surface text-on-surface font-label-md text-label-md uppercase tracking-wider rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-outline-variant/30"
            >
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              Registrar Remito
            </button>
            <button
              onClick={() => onNavigate('nueva-orden-compra')}
              className="flex items-center gap-sm px-md py-sm bg-secondary-container text-on-secondary-container font-label-md text-label-md uppercase tracking-wider rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
              Nueva Orden de Compra
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-12 gap-lg flex-1">
        {/* Left Column: Data Tables (Tabs) */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-lg h-full">
          <div className="bg-surface-container-lowest rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden border border-outline-variant/20">
            {/* Tabs Header */}
            <div className="flex border-b border-surface-container-high px-md pt-sm">
              <button
                onClick={() => setActiveTab('po')}
                className={`px-md py-sm font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors ${
                  activeTab === 'po' ? 'text-primary border-primary font-bold' : 'text-on-surface-variant border-transparent hover:text-on-surface'
                }`}
              >
                Órdenes de Compra
              </button>
              <button
                onClick={() => setActiveTab('suppliers')}
                className={`px-md py-sm font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors ${
                  activeTab === 'suppliers' ? 'text-primary border-primary font-bold' : 'text-on-surface-variant border-transparent hover:text-on-surface'
                }`}
              >
                Proveedores ({suppliers.length})
              </button>
            </div>

            {/* PO Content */}
            {activeTab === 'po' && (
              <div className="flex-1 p-md overflow-auto">
                <div className="flex justify-between items-center mb-md">
                  <div className="relative w-64">
                    <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-outline-variant text-[18px]">search</span>
                    <input
                      type="text"
                      value={poSearch}
                      onChange={(e) => setPoSearch(e.target.value)}
                      placeholder="Buscar orden..."
                      className="w-full bg-surface-container-low border-none rounded-lg py-sm pl-xl pr-sm font-body-md text-body-md focus:ring-2 focus:ring-primary-container outline-none"
                    />
                  </div>
                </div>

                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-primary-container font-label-md text-label-md uppercase tracking-wider border-b border-surface-container-high">
                      <th className="py-sm px-xs font-semibold">Nº Orden</th>
                      <th className="py-sm px-xs font-semibold">Fecha</th>
                      <th className="py-sm px-xs font-semibold">Proveedor</th>
                      <th className="py-sm px-xs font-semibold text-right">Total</th>
                      <th className="py-sm px-xs font-semibold text-center">Estado Recepción</th>
                      <th className="py-sm px-xs font-semibold text-center">Estado Pago</th>
                      <th className="py-sm px-xs w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-body-md text-on-surface divide-y divide-surface-container-high">
                    {filteredOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-surface-container-low transition-colors cursor-pointer group">
                        <td className="py-sm px-xs font-mono-sm text-mono-sm font-bold text-primary">{ord.id}</td>
                        <td className="py-sm px-xs text-on-surface-variant">{ord.date}</td>
                        <td className="py-sm px-xs font-medium">{ord.supplier}</td>
                        <td className="py-sm px-xs text-right font-mono-sm text-mono-sm">${ord.total.toFixed(2)}</td>
                        <td className="py-sm px-xs text-center">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-label-md font-label-md text-[10px] uppercase tracking-wider ${
                              ord.receiptStatus === 'Recibido'
                                ? 'bg-tertiary-container text-on-tertiary-container'
                                : ord.receiptStatus === 'Parcial'
                                ? 'bg-secondary-container/20 text-secondary-container'
                                : 'bg-surface-container-high text-on-surface-variant'
                            }`}
                          >
                            {ord.receiptStatus}
                          </span>
                        </td>
                        <td className="py-sm px-xs text-center">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-label-md font-label-md text-[10px] uppercase tracking-wider ${
                              ord.paymentStatus === 'Pagado'
                                ? 'bg-tertiary-container text-on-tertiary-container'
                                : 'bg-error-container text-on-error-container'
                            }`}
                          >
                            {ord.paymentStatus}
                          </span>
                        </td>
                        <td className="py-sm px-xs text-right">
                          <button className="text-outline hover:text-primary opacity-80 group-hover:opacity-100 transition-opacity">
                            <span className="material-symbols-outlined text-[18px]">more_vert</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Suppliers Content */}
            {activeTab === 'suppliers' && (
              <div className="flex-1 p-md overflow-auto">
                <div className="flex justify-between items-center mb-md">
                  <div className="relative w-64">
                    <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-outline-variant text-[18px]">search</span>
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={(e) => setSupplierSearch(e.target.value)}
                      placeholder="Buscar proveedor..."
                      className="w-full bg-surface-container-low border-none rounded-lg py-sm pl-xl pr-sm font-body-md text-body-md focus:ring-2 focus:ring-primary-container outline-none"
                    />
                  </div>
                  <button
                    onClick={() => alert('Formulario de Nuevo Proveedor')}
                    className="flex items-center gap-xs text-primary font-label-md text-label-md hover:bg-surface-container-low px-sm py-xs rounded cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span> Nuevo Proveedor
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  {filteredSuppliers.map((sup) => (
                    <div
                      key={sup.id}
                      className="p-md rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-shadow border border-surface-container flex gap-md items-center cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-headline-md text-headline-md">
                        {sup.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-headline-md text-headline-md text-on-surface truncate">{sup.name}</h3>
                        <p className="font-body-md text-body-md text-on-surface-variant truncate">{sup.email}</p>
                        <p className="font-mono-sm text-xs text-outline mt-1">{sup.phone} • NIF: {sup.taxId}</p>
                      </div>
                      <span className="material-symbols-outlined text-outline">chevron_right</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Integration & Widgets */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-lg">
          {/* Synchronization Widget */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-lg relative overflow-hidden group border border-outline-variant/20">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-tertiary-container/10 rounded-full blur-xl group-hover:bg-tertiary-container/20 transition-colors"></div>
            <div className="flex items-center gap-sm mb-md relative z-10">
              <span className="material-symbols-outlined text-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>sync_alt</span>
              <h2 className="font-headline-md text-headline-md text-on-surface">Sincronización de Stock</h2>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant mb-md relative z-10">
              Las recepciones de órdenes de compra actualizan automáticamente el inventario disponible.
            </p>
            <div className="bg-surface-container-low p-sm rounded-lg flex items-center justify-between relative z-10">
              <span className="font-label-md text-label-md text-on-surface uppercase">Estado Actual</span>
              <span className="inline-flex items-center gap-xs text-on-tertiary-container font-label-md text-label-md">
                <span className="w-2 h-2 rounded-full bg-tertiary-container animate-pulse"></span>
                En línea
              </span>
            </div>
          </div>

          {/* Expenses Chart Mini Widget */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-lg flex flex-col h-64 relative border border-outline-variant/20">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">Gastos por Categoría</h2>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-md">Últimos 30 días</p>
            <div className="flex-1 relative w-full h-full flex items-end gap-sm">
              <div className="w-1/4 bg-primary-container rounded-t-sm h-[80%] hover:opacity-80 transition-opacity" title="Equipos (80%)"></div>
              <div className="w-1/4 bg-secondary-container rounded-t-sm h-[45%] hover:opacity-80 transition-opacity" title="Insumos (45%)"></div>
              <div className="w-1/4 bg-surface-container-high rounded-t-sm h-[60%] hover:opacity-80 transition-opacity" title="Servicios (60%)"></div>
              <div className="w-1/4 bg-outline-variant rounded-t-sm h-[20%] hover:opacity-80 transition-opacity" title="Otros (20%)"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
