import React from 'react';
import { ViewPath } from '../../types';

interface DashboardViewProps {
  onNavigate: (view: ViewPath) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  return (
    <div className="flex flex-col w-full gap-xl">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
        <div className="bg-surface-container-lowest p-md rounded-xl shadow-sm flex flex-col gap-sm border border-outline-variant/20">
          <div className="flex justify-between items-center text-on-surface-variant">
            <span className="font-label-md text-label-md uppercase tracking-wider">Total Sales</span>
            <span className="material-symbols-outlined text-[20px]">payments</span>
          </div>
          <div className="flex items-end gap-sm">
            <span className="font-display-lg text-display-lg text-on-surface">$124,500</span>
            <div className="flex items-center text-on-tertiary-container bg-tertiary-fixed-dim/20 px-sm py-[2px] rounded-full mb-xs">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              <span className="font-mono-sm text-mono-sm ml-xs">+14.2%</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-md rounded-xl shadow-sm flex flex-col gap-sm border border-outline-variant/20">
          <div className="flex justify-between items-center text-on-surface-variant">
            <span className="font-label-md text-label-md uppercase tracking-wider">Cash Flow</span>
            <span className="material-symbols-outlined text-[20px]">account_balance</span>
          </div>
          <div className="flex items-end gap-sm">
            <span className="font-display-lg text-display-lg text-on-surface">$82,100</span>
            <div className="flex items-center text-on-surface-variant px-sm py-[2px] mb-xs">
              <span className="font-mono-sm text-mono-sm">Net Position</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-md rounded-xl shadow-sm flex flex-col gap-sm border border-outline-variant/20">
          <div className="flex justify-between items-center text-on-surface-variant">
            <span className="font-label-md text-label-md uppercase tracking-wider">Pending Orders</span>
            <span className="material-symbols-outlined text-[20px]">local_shipping</span>
          </div>
          <div className="flex items-end gap-sm">
            <span className="font-display-lg text-display-lg text-on-surface">43</span>
            <div className="flex items-center text-on-error-container bg-error-container/50 px-sm py-[2px] rounded-full mb-xs">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              <span className="font-mono-sm text-mono-sm ml-xs">12 Overdue</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-md rounded-xl shadow-sm flex flex-col gap-sm border border-outline-variant/20">
          <div className="flex justify-between items-center text-on-surface-variant">
            <span className="font-label-md text-label-md uppercase tracking-wider">Low Stock Alerts</span>
            <span className="material-symbols-outlined text-[20px]">warning</span>
          </div>
          <div className="flex items-end gap-sm">
            <span className="font-display-lg text-display-lg text-on-surface">18</span>
            <div className="flex items-center text-on-surface-variant px-sm py-[2px] mb-xs">
              <span className="font-mono-sm text-mono-sm">SKUs below threshold</span>
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
              <h2 className="font-headline-md text-headline-md text-on-surface">Financial Overview</h2>
              <select className="bg-surface-container-low text-on-surface font-body-md text-body-md py-sm px-md rounded-lg outline-none cursor-pointer focus:ring-2 focus:ring-secondary-container">
                <option>Last 30 Days</option>
                <option>This Quarter</option>
                <option>Year to Date</option>
              </select>
            </div>
            <div className="flex-1 relative flex items-end justify-between px-md pb-md">
              <div className="absolute inset-0 flex flex-col justify-between pt-10 pb-6 pointer-events-none">
                <div className="w-full h-[1px] bg-outline-variant/30"></div>
                <div className="w-full h-[1px] bg-outline-variant/30"></div>
                <div className="w-full h-[1px] bg-outline-variant/30"></div>
                <div className="w-full h-[1px] bg-outline-variant/30"></div>
              </div>
              <div className="flex gap-sm items-end h-full relative z-10 w-full justify-between pr-4">
                <div className="flex gap-1 items-end h-[60%]"><div className="w-8 bg-secondary-container rounded-t-sm opacity-80 hover:opacity-100 transition-opacity"></div><div className="w-8 bg-error-container rounded-t-sm h-[40%] opacity-80 hover:opacity-100 transition-opacity"></div></div>
                <div className="flex gap-1 items-end h-[45%]"><div className="w-8 bg-secondary-container rounded-t-sm h-[100%] opacity-80 hover:opacity-100 transition-opacity"></div><div className="w-8 bg-error-container rounded-t-sm h-[60%] opacity-80 hover:opacity-100 transition-opacity"></div></div>
                <div className="flex gap-1 items-end h-[80%]"><div className="w-8 bg-secondary-container rounded-t-sm h-[100%] opacity-80 hover:opacity-100 transition-opacity"></div><div className="w-8 bg-error-container rounded-t-sm h-[30%] opacity-80 hover:opacity-100 transition-opacity"></div></div>
                <div className="flex gap-1 items-end h-[70%]"><div className="w-8 bg-secondary-container rounded-t-sm h-[100%] opacity-80 hover:opacity-100 transition-opacity"></div><div className="w-8 bg-error-container rounded-t-sm h-[50%] opacity-80 hover:opacity-100 transition-opacity"></div></div>
                <div className="flex gap-1 items-end h-[90%]"><div className="w-8 bg-secondary-container rounded-t-sm h-[100%] opacity-80 hover:opacity-100 transition-opacity"></div><div className="w-8 bg-error-container rounded-t-sm h-[45%] opacity-80 hover:opacity-100 transition-opacity"></div></div>
                <div className="flex gap-1 items-end h-[100%]"><div className="w-8 bg-secondary-container rounded-t-sm h-[100%] opacity-80 hover:opacity-100 transition-opacity"></div><div className="w-8 bg-error-container rounded-t-sm h-[20%] opacity-80 hover:opacity-100 transition-opacity"></div></div>
              </div>
            </div>
            <div className="flex justify-center gap-md mt-sm">
              <div className="flex items-center gap-xs font-label-md text-label-md text-on-surface-variant"><span className="w-3 h-3 rounded-full bg-secondary-container"></span> Sales</div>
              <div className="flex items-center gap-xs font-label-md text-label-md text-on-surface-variant"><span className="w-3 h-3 rounded-full bg-error-container"></span> Expenses</div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col border border-outline-variant/20">
            <div className="p-lg flex justify-between items-center border-b border-surface-container-high">
              <h2 className="font-headline-md text-headline-md text-on-surface">Recent Activity</h2>
              <button onClick={() => onNavigate('ventas')} className="text-secondary-container font-label-md text-label-md hover:underline cursor-pointer">
                View All
              </button>
            </div>
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    <th className="py-md px-lg font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">Transaction ID</th>
                    <th className="py-md px-lg font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">Type</th>
                    <th className="py-md px-lg font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">Date</th>
                    <th className="py-md px-lg font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold text-right">Amount</th>
                    <th className="py-md px-lg font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="text-body-md font-body-md">
                  <tr className="border-b border-surface-container-highest/50 hover:bg-surface-container-low/30 transition-colors">
                    <td className="py-md px-lg font-mono-sm text-mono-sm text-on-surface">#TRX-8921</td>
                    <td className="py-md px-lg text-on-surface">Sale - B2B</td>
                    <td className="py-md px-lg text-on-surface-variant">Today, 14:32</td>
                    <td className="py-md px-lg text-on-surface text-right font-medium">$4,250.00</td>
                    <td className="py-md px-lg"><span className="inline-flex items-center px-2 py-1 rounded-full bg-tertiary-fixed-dim/20 text-on-tertiary-container font-label-md text-label-md text-[10px]">Completed</span></td>
                  </tr>
                  <tr className="border-b border-surface-container-highest/50 hover:bg-surface-container-low/30 transition-colors">
                    <td className="py-md px-lg font-mono-sm text-mono-sm text-on-surface">#PO-4412</td>
                    <td className="py-md px-lg text-on-surface">Restock - Raw Materials</td>
                    <td className="py-md px-lg text-on-surface-variant">Today, 11:15</td>
                    <td className="py-md px-lg text-on-surface text-right font-medium">-$1,800.00</td>
                    <td className="py-md px-lg"><span className="inline-flex items-center px-2 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md text-[10px]">Processing</span></td>
                  </tr>
                  <tr className="hover:bg-surface-container-low/30 transition-colors">
                    <td className="py-md px-lg font-mono-sm text-mono-sm text-on-surface">#TRX-8920</td>
                    <td className="py-md px-lg text-on-surface">Sale - Retail</td>
                    <td className="py-md px-lg text-on-surface-variant">Yesterday, 16:45</td>
                    <td className="py-md px-lg text-on-surface text-right font-medium">$320.50</td>
                    <td className="py-md px-lg"><span className="inline-flex items-center px-2 py-1 rounded-full bg-tertiary-fixed-dim/20 text-on-tertiary-container font-label-md text-label-md text-[10px]">Completed</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar Widgets */}
        <div className="flex flex-col gap-md">
          <div className="bg-primary text-on-primary p-lg rounded-xl shadow-md flex flex-col gap-lg relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-secondary-container/20 rounded-full blur-2xl pointer-events-none"></div>
            <h3 className="font-headline-md text-headline-md relative z-10">Quick Actions</h3>
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
            <h3 className="font-headline-md text-headline-md text-on-surface">Top Products</h3>
            <div className="flex flex-col gap-sm">
              <div className="flex items-center justify-between py-xs border-b border-surface-container">
                <div className="flex items-center gap-sm">
                  <div className="w-10 h-10 rounded bg-surface-container-low flex items-center justify-center text-on-surface-variant font-mono-sm text-mono-sm font-bold">01</div>
                  <div>
                    <p className="font-body-md text-body-md font-medium text-on-surface">Proxima Server Rack</p>
                    <p className="font-mono-sm text-mono-sm text-on-surface-variant">SKU: SR-200</p>
                  </div>
                </div>
                <span className="font-label-md text-label-md text-on-surface">142 units</span>
              </div>
              <div className="flex items-center justify-between py-xs border-b border-surface-container">
                <div className="flex items-center gap-sm">
                  <div className="w-10 h-10 rounded bg-surface-container-low flex items-center justify-center text-on-surface-variant font-mono-sm text-mono-sm font-bold">02</div>
                  <div>
                    <p className="font-body-md text-body-md font-medium text-on-surface">Nexus Router X5</p>
                    <p className="font-mono-sm text-mono-sm text-on-surface-variant">SKU: NR-X50</p>
                  </div>
                </div>
                <span className="font-label-md text-label-md text-on-surface">98 units</span>
              </div>
              <div className="flex items-center justify-between py-xs">
                <div className="flex items-center gap-sm">
                  <div className="w-10 h-10 rounded bg-surface-container-low flex items-center justify-center text-on-surface-variant font-mono-sm text-mono-sm font-bold">03</div>
                  <div>
                    <p className="font-body-md text-body-md font-medium text-on-surface">Cat6 Cable Box</p>
                    <p className="font-mono-sm text-mono-sm text-on-surface-variant">SKU: CB-1000</p>
                  </div>
                </div>
                <span className="font-label-md text-label-md text-on-surface">85 units</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
