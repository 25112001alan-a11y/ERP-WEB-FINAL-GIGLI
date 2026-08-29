import React from 'react';
import { ViewPath, DashboardData } from '../../types';

interface DashboardViewProps {
  dashboard: DashboardData | null;
  onNavigate: (view: ViewPath) => void;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_BADGE: Record<string, string> = {
  Pagado: 'bg-tertiary-fixed-dim/20 text-on-tertiary-container',
  Recibido: 'bg-tertiary-fixed-dim/20 text-on-tertiary-container',
  Abierto: 'bg-secondary-container/20 text-secondary',
  Parcial: 'bg-secondary-container/20 text-secondary',
};

const TYPE_LABEL: Record<string, string> = {
  VENTA: 'Venta',
  COMPRA: 'Compra',
  OC: 'Orden de Compra',
  COTIZACION: 'Cotización',
  PEDIDO: 'Pedido',
  REMITO: 'Remito',
};

export const DashboardView: React.FC<DashboardViewProps> = ({ dashboard, onNavigate }) => {
  if (!dashboard) {
    return (
      <div className="flex flex-col w-full gap-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-container-lowest p-md rounded-xl shadow-sm border border-outline-variant/20 animate-pulse h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
          <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 animate-pulse h-96" />
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 animate-pulse h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-xl">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
        <div className="bg-surface-container-lowest p-md rounded-xl shadow-sm flex flex-col gap-sm border border-outline-variant/20">
          <div className="flex justify-between items-center text-on-surface-variant">
            <span className="font-label-md text-label-md uppercase tracking-wider">Ventas ({dashboard.month})</span>
            <span className="material-symbols-outlined text-[20px]">payments</span>
          </div>
          <div className="flex items-end gap-sm">
            <span className="font-display-lg text-display-lg text-on-surface">{formatCurrency(dashboard.totalSalesMonth)}</span>
            <div className="flex items-center text-on-tertiary-container bg-tertiary-fixed-dim/20 px-sm py-[2px] rounded-full mb-xs">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              <span className="font-mono-sm text-mono-sm ml-xs">ingresos</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-md rounded-xl shadow-sm flex flex-col gap-sm border border-outline-variant/20">
          <div className="flex justify-between items-center text-on-surface-variant">
            <span className="font-label-md text-label-md uppercase tracking-wider">Flujo de Caja Neto</span>
            <span className="material-symbols-outlined text-[20px]">account_balance</span>
          </div>
          <div className="flex items-end gap-sm">
            <span className={`font-display-lg text-display-lg ${dashboard.netCashFlow >= 0 ? 'text-on-surface' : 'text-error'}`}>
              {formatCurrency(dashboard.netCashFlow)}
            </span>
            <div className="flex items-center text-on-surface-variant px-sm py-[2px] mb-xs">
              <span className="font-mono-sm text-mono-sm">ingresos − egresos</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-md rounded-xl shadow-sm flex flex-col gap-sm border border-outline-variant/20">
          <div className="flex justify-between items-center text-on-surface-variant">
            <span className="font-label-md text-label-md uppercase tracking-wider">Órdenes de Compra Abiertas</span>
            <span className="material-symbols-outlined text-[20px]">local_shipping</span>
          </div>
          <div className="flex items-end gap-sm">
            <span className="font-display-lg text-display-lg text-on-surface">{dashboard.pendingOrders}</span>
            <div className="flex items-center text-on-surface-variant px-sm py-[2px] mb-xs">
              <span className="font-mono-sm text-mono-sm">pendientes de recepción</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-md rounded-xl shadow-sm flex flex-col gap-sm border border-outline-variant/20">
          <div className="flex justify-between items-center text-on-surface-variant">
            <span className="font-label-md text-label-md uppercase tracking-wider">Alertas de Stock Bajo</span>
            <span className="material-symbols-outlined text-[20px]">warning</span>
          </div>
          <div className="flex items-end gap-sm">
            <span className={`font-display-lg text-display-lg ${dashboard.lowStockCount > 0 ? 'text-error' : 'text-on-surface'}`}>
              {dashboard.lowStockCount}
            </span>
            <div className="flex items-center text-on-surface-variant px-sm py-[2px] mb-xs">
              <span className="font-mono-sm text-mono-sm">SKUs bajo mínimo</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dashboard Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-xl">
        <div className="lg:col-span-2 flex flex-col gap-md">
          {/* Financial Overview Chart Mock */}
          <div className="bg-surface-container-lowest p-lg rounded-xl shadow-sm h-96 flex flex-col border border-outline-variant/20">
            <div className="flex justify-between items-center mb-md">
              <h2 className="font-headline-md text-headline-md text-on-surface">Resumen Financiero — {dashboard.month}</h2>
              <div className="flex gap-md items-center font-label-md text-label-md text-on-surface-variant">
                <span className="flex items-center gap-xs"><span className="w-3 h-3 rounded-full bg-secondary-container"></span> Ventas: {formatCurrency(dashboard.totalSalesMonth)}</span>
                <span className="flex items-center gap-xs"><span className="w-3 h-3 rounded-full bg-error-container"></span> Compras: {formatCurrency(dashboard.totalExpensesMonth)}</span>
              </div>
            </div>
            <div className="flex-1 relative flex items-end justify-between px-md pb-md">
              <div className="absolute inset-0 flex flex-col justify-between pt-10 pb-6 pointer-events-none">
                <div className="w-full h-[1px] bg-outline-variant/30"></div>
                <div className="w-full h-[1px] bg-outline-variant/30"></div>
                <div className="w-full h-[1px] bg-outline-variant/30"></div>
                <div className="w-full h-[1px] bg-outline-variant/30"></div>
              </div>
              <div className="flex gap-sm items-end h-full relative z-10 w-full justify-between pr-4">
                <div className="flex gap-1 items-end h-full justify-end">
                  <div className="w-10 bg-secondary-container rounded-t-sm opacity-90" style={{ height: `${Math.min(100, Math.max(4, (dashboard.totalSalesMonth / Math.max(dashboard.totalSalesMonth, dashboard.totalExpensesMonth, 1)) * 100))}%` }}></div>
                </div>
                <div className="flex gap-1 items-end h-full justify-end">
                  <div className="w-10 bg-error-container rounded-t-sm opacity-90" style={{ height: `${Math.min(100, Math.max(4, (dashboard.totalExpensesMonth / Math.max(dashboard.totalSalesMonth, dashboard.totalExpensesMonth, 1)) * 100))}%` }}></div>
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-md mt-sm">
              <div className="flex items-center gap-xs font-label-md text-label-md text-on-surface-variant"><span className="w-3 h-3 rounded-full bg-secondary-container"></span> Ventas</div>
              <div className="flex items-center gap-xs font-label-md text-label-md text-on-surface-variant"><span className="w-3 h-3 rounded-full bg-error-container"></span> Compras</div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col border border-outline-variant/20">
            <div className="p-lg flex justify-between items-center border-b border-surface-container-high">
              <h2 className="font-headline-md text-headline-md text-on-surface">Actividad Reciente</h2>
              <button onClick={() => onNavigate('ventas')} className="text-secondary-container font-label-md text-label-md hover:underline cursor-pointer">
                Ver ventas
              </button>
            </div>
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    <th className="py-md px-lg font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">Comprobante</th>
                    <th className="py-md px-lg font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">Tipo</th>
                    <th className="py-md px-lg font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">Entidad</th>
                    <th className="py-md px-lg font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold text-right">Monto</th>
                    <th className="py-md px-lg font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="text-body-md font-body-md">
                  {dashboard.recent.map((r) => (
                    <tr key={r.id} className="border-b border-surface-container-highest/50 hover:bg-surface-container-low/30 transition-colors">
                      <td className="py-md px-lg font-mono-sm text-mono-sm text-on-surface">#{r.label}</td>
                      <td className="py-md px-lg text-on-surface">{TYPE_LABEL[r.type] ?? r.type}</td>
                      <td className="py-md px-lg text-on-surface-variant">{r.partyName || '—'}</td>
                      <td className={`py-md px-lg text-right font-medium ${r.type === 'COMPRA' ? 'text-error' : 'text-on-surface'}`}>
                        {r.type === 'COMPRA' ? '-' : ''}{formatCurrency(r.amount)}
                      </td>
                      <td className="py-md px-lg">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full font-label-md text-label-md text-[10px] ${STATUS_BADGE[r.status] ?? 'bg-surface-container-high text-on-surface-variant'}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {dashboard.recent.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-md px-lg text-center text-on-surface-variant">Sin movimientos todavía.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar Widgets */}
        <div className="flex flex-col gap-md">
          <div className="bg-primary text-on-primary p-lg rounded-xl shadow-md flex flex-col gap-lg relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-secondary-container/20 rounded-full blur-2xl pointer-events-none"></div>
            <h3 className="font-headline-md text-headline-md relative z-10">Acciones Rápidas</h3>
            <div className="flex flex-col gap-sm relative z-10">
              <button
                onClick={() => onNavigate('pos')}
                className="bg-secondary-container text-on-secondary-container hover:bg-secondary transition-colors py-md px-lg rounded-lg flex items-center justify-between font-label-md text-label-md tracking-wider uppercase cursor-pointer group"
              >
                <span>Nueva Venta (POS)</span>
                <span className="material-symbols-outlined transform group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
              <button
                onClick={() => onNavigate('nueva-orden-compra')}
                className="bg-surface-container-highest/10 border border-outline-variant/30 text-on-primary hover:bg-surface-container-highest/20 transition-colors py-md px-lg rounded-lg flex items-center justify-between font-label-md text-label-md tracking-wider uppercase cursor-pointer"
              >
                <span>Cargar Compra</span>
                <span className="material-symbols-outlined">add_shopping_cart</span>
              </button>
              <button
                onClick={() => onNavigate('inventario-ajuste')}
                className="bg-surface-container-highest/10 border border-outline-variant/30 text-on-primary hover:bg-surface-container-highest/20 transition-colors py-md px-lg rounded-lg flex items-center justify-between font-label-md text-label-md tracking-wider uppercase cursor-pointer"
              >
                <span>Ajuste de Stock</span>
                <span className="material-symbols-outlined">inventory</span>
              </button>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-lg rounded-xl shadow-sm flex flex-col gap-md border border-outline-variant/20">
            <h3 className="font-headline-md text-headline-md text-on-surface">Productos Más Vendidos</h3>
            <div className="flex flex-col gap-sm">
              {dashboard.topProducts.map((p, i) => (
                <div key={`${p.sku}-${i}`} className="flex items-center justify-between py-xs border-b last:border-b-0 border-surface-container">
                  <div className="flex items-center gap-sm">
                    <div className="w-10 h-10 rounded bg-surface-container-low flex items-center justify-center text-on-surface-variant font-mono-sm text-mono-sm font-bold">
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div>
                      <p className="font-body-md text-body-md font-medium text-on-surface">{p.name}</p>
                      {p.sku && <p className="font-mono-sm text-mono-sm text-on-surface-variant">SKU: {p.sku}</p>}
                    </div>
                  </div>
                  <span className="font-label-md text-label-md text-on-surface">{p.units} u.</span>
                </div>
              ))}
              {dashboard.topProducts.length === 0 && (
                <p className="text-body-md text-on-surface-variant">Sin ventas registradas todavía.</p>
              )}
            </div>
          </div>

          {dashboard.lowStockCount > 0 && (
            <div className="bg-error-container/20 p-lg rounded-xl shadow-sm flex flex-col gap-md border border-error-container/40">
              <h3 className="font-headline-md text-headline-md text-error flex items-center gap-sm">
                <span className="material-symbols-outlined">warning</span>
                Stock Bajo
              </h3>
              <div className="flex flex-col gap-xs">
                {dashboard.lowStockProducts.map((s) => (
                  <div key={s.productId} className="flex items-center justify-between py-xs border-b border-error-container/20 last:border-b-0">
                    <div>
                      <p className="font-body-md text-body-md text-on-surface">{s.name}</p>
                      <p className="font-mono-sm text-mono-sm text-on-surface-variant">{s.warehouse}</p>
                    </div>
                    <span className="font-mono-sm text-mono-sm text-error font-bold">{s.stock} / mín {s.minStock}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};