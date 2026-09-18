import React from 'react';
import { ViewPath } from '../../types';

interface SidebarProps {
  currentView: ViewPath;
  onNavigate: (view: ViewPath) => void;
  open: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, open, onClose }) => {
  const getIsActive = (path: ViewPath) => {
    if (path === 'inventario') {
      return ['inventario', 'inventario-ajuste', 'inventario-transferencia', 'inventario-nuevo-producto'].includes(currentView);
    }
    if (path === 'ventas') {
      return ['ventas', 'registrar-factura', 'remito-salida'].includes(currentView);
    }
    if (path === 'compras') {
      return ['compras', 'nueva-orden-compra', 'registrar-remito', 'registrar-factura'].includes(currentView);
    }
    if (path === 'pedidos-publicos') {
      return ['pedidos-publicos', 'nuevo-pedido-manual', 'portal-clientes'].includes(currentView);
    }
    if (path === 'configuracion') {
      return ['configuracion'].includes(currentView);
    }
    if (path === 'administracion') {
      return ['administracion', 'nuevo-usuario', 'log-auditoria'].includes(currentView);
    }
    return currentView === path;
  };

  const navItems: { path: ViewPath; label: string; icon: string }[] = [
    { path: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: 'inventario', label: 'Inventario', icon: 'inventory_2' },
    { path: 'pos', label: 'POS', icon: 'point_of_sale' },
    { path: 'ventas', label: 'Ventas', icon: 'payments' },
    { path: 'pedidos-publicos', label: 'Pedidos Públicos', icon: 'shopping_cart_checkout' },
    { path: 'compras', label: 'Compras', icon: 'shopping_bag' },
    { path: 'finanzas', label: 'Finanzas', icon: 'account_balance_wallet' },
    { path: 'reportes', label: 'Reportes', icon: 'bar_chart' },
    { path: 'configuracion', label: 'Configuración', icon: 'settings' },
  ];

  const adminItems: { path: ViewPath; label: string; icon: string }[] = [
    { path: 'administracion', label: 'Administración', icon: 'admin_panel_settings' },
  ];

  const handleNav = (path: ViewPath) => {
    onNavigate(path);
    onClose();
  };

  return (
    <>
      {/* Backdrop (solo mobile): tapa header y contenido mientras el drawer está abierto */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-[45] lg:hidden"
          onClick={onClose}
          role="presentation"
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-[#0b132b] text-white z-50 flex flex-col shadow-2xl select-none border-r border-slate-800/80 transform transition-transform duration-200 ease-in-out ${
          open ? 'translate-x-0 visible' : '-translate-x-full invisible'
        } lg:translate-x-0 lg:visible`}
        aria-label="Menú de navegación"
      >
        {/* Brand Header */}
        <div
          onClick={() => handleNav('dashboard')}
          className="p-lg flex items-center gap-md border-b border-slate-800/80 cursor-pointer hover:bg-slate-800/40 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
            <span className="material-symbols-outlined text-[20px]">hub</span>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-headline-md text-headline-md tracking-tight font-bold text-white leading-none">
              NEXUS ERP
            </span>
            <span className="text-[10px] text-slate-400 tracking-wider font-mono uppercase mt-0.5">Enterprise System</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-sm -mr-sm rounded-lg hover:bg-slate-800/60 transition-colors text-slate-300 cursor-pointer tap-target"
            aria-label="Cerrar menú"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-lg space-y-1.5 px-md overflow-y-auto">
          {navItems.map((item) => {
            const active = getIsActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`w-full flex items-center gap-md px-md py-2.5 rounded-lg transition-all text-left font-body-md cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white font-semibold shadow-lg shadow-blue-600/25'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-md mt-md border-t border-slate-800/40 px-sm text-[10px] font-mono uppercase tracking-wider text-slate-500">
            Sistema
          </div>
          {adminItems.map((item) => {
            const active = getIsActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`w-full flex items-center gap-md px-md py-2.5 rounded-lg transition-all text-left font-body-md cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white font-semibold shadow-lg shadow-blue-600/25'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer System Status */}
        <div className="p-md border-t border-slate-800/80 text-xs text-slate-400 flex flex-col gap-1.5 bg-[#080d1e]">
          <div className="flex items-center justify-between">
            <span>SaaS Status:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              En línea
            </span>
          </div>
          <div className="font-mono text-[10px] text-slate-500">
            v2.4.0 • Enterprise Cloud
          </div>
        </div>
      </aside>
    </>
  );
};