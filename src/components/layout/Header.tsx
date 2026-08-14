import React, { useState } from 'react';
import { ViewPath } from '../../types';

interface HeaderProps {
  currentView: ViewPath;
  onNavigate: (view: ViewPath) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  searchTerm,
  onSearchChange,
}) => {
  const [showQuickNav, setShowQuickNav] = useState(false);
  const [notificationsOpen, setShowNotificationsOpen] = useState(false);

  return (
    <header className="fixed top-0 left-64 right-0 h-16 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex items-center justify-between px-lg border-b border-outline-variant/20">
      {/* Search Input */}
      <div className="flex items-center flex-1">
        <div className="relative w-96 max-w-full">
          <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline text-[20px]">
            search
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar en Nexus..."
            className="w-full bg-surface-container-low border-none rounded-full py-base pl-10 pr-md text-body-md focus:ring-2 focus:ring-secondary-container outline-none transition-all"
          />
        </div>
      </div>

      {/* Right User Actions */}
      <div className="flex items-center gap-lg">
        <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest hidden md:inline-block">
          SaaS Enterprise Tenant
        </span>

        {/* Quick View Switcher Button */}
        <button
          onClick={() => setShowQuickNav(!showQuickNav)}
          title="Vista Rápida de Pantallas"
          className="flex items-center gap-xs px-sm py-xs bg-surface-container-high text-on-surface hover:bg-surface-container-highest rounded-lg transition-colors font-label-md text-label-md cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] text-secondary">widgets</span>
          <span className="hidden sm:inline">Navegación</span>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotificationsOpen(!notificationsOpen)}
            className="relative p-base hover:bg-surface-container-high rounded-full transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
            <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full animate-pulse"></span>
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 p-md z-50">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-xs mb-sm">
                <span className="font-headline-md text-[14px] text-on-surface">Notificaciones</span>
                <span className="font-mono-sm text-[10px] bg-error-container text-on-error-container px-2 py-0.5 rounded-full">3 Nuevas</span>
              </div>
              <div className="space-y-sm max-h-64 overflow-y-auto">
                <div className="p-xs hover:bg-surface-container-low rounded-lg transition-colors cursor-pointer" onClick={() => onNavigate('pedidos-publicos')}>
                  <p className="font-label-md text-on-surface">Nuevo Pedido Público #ORD-99321</p>
                  <p className="font-body-md text-xs text-on-surface-variant">Carlos Aranda - $3,450.00</p>
                </div>
                <div className="p-xs hover:bg-surface-container-low rounded-lg transition-colors cursor-pointer" onClick={() => onNavigate('inventario')}>
                  <p className="font-label-md text-error">Alerta de Stock Bajo</p>
                  <p className="font-body-md text-xs text-on-surface-variant">Teclado Mecánico K2 (12 unidades restantes)</p>
                </div>
                <div className="p-xs hover:bg-surface-container-low rounded-lg transition-colors cursor-pointer" onClick={() => onNavigate('finanzas')}>
                  <p className="font-label-md text-on-tertiary-container">Conciliación Bancaria</p>
                  <p className="font-body-md text-xs text-on-surface-variant">Transacción TX-8921 recibida con éxito</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="flex items-center gap-sm pl-md border-l border-outline-variant">
          <div className="text-right hidden lg:block">
            <p className="text-body-md font-bold leading-tight">Admin User</p>
            <p className="text-mono-sm text-on-surface-variant uppercase">Super Administrador</p>
          </div>
          <button
            onClick={() => onNavigate('auth-login')}
            title="Ver Iniciar Sesión / Cuenta"
            className="w-8 h-8 rounded-full bg-primary hover:bg-primary-container transition-colors flex items-center justify-center text-on-primary cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">person</span>
          </button>
        </div>
      </div>

      {/* Quick Navigation Drawer/Modal */}
      {showQuickNav && (
        <div className="absolute top-16 right-lg w-96 bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/30 p-lg z-50">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-sm mb-md">
            <h3 className="font-headline-md text-headline-md text-on-surface">Pantallas de Nexus ERP</h3>
            <button onClick={() => setShowQuickNav(false)} className="text-outline hover:text-on-surface">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-xs max-h-[70vh] overflow-y-auto">
            <button
              onClick={() => { onNavigate('dashboard'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'dashboard' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">dashboard</span> Dashboard
            </button>
            <button
              onClick={() => { onNavigate('inventario'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'inventario' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">inventory_2</span> Inventario
            </button>
            <button
              onClick={() => { onNavigate('inventario-ajuste'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'inventario-ajuste' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">tune</span> Ajuste de Stock
            </button>
            <button
              onClick={() => { onNavigate('inventario-transferencia'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'inventario-transferencia' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">swap_horiz</span> Transferencia Stock
            </button>
            <button
              onClick={() => { onNavigate('inventario-nuevo-producto'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'inventario-nuevo-producto' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">add_box</span> Agregar Producto
            </button>
            <button
              onClick={() => { onNavigate('pos'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'pos' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">point_of_sale</span> Punto de Venta (POS)
            </button>
            <button
              onClick={() => { onNavigate('ventas'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'ventas' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">payments</span> Ventas
            </button>
            <button
              onClick={() => { onNavigate('pedidos-publicos'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'pedidos-publicos' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">shopping_cart_checkout</span> Pedidos Públicos
            </button>
            <button
              onClick={() => { onNavigate('nuevo-pedido-manual'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'nuevo-pedido-manual' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">post_add</span> Pedido Manual
            </button>
            <button
              onClick={() => { onNavigate('portal-clientes'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'portal-clientes' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">storefront</span> Portal de Clientes
            </button>
            <button
              onClick={() => { onNavigate('compras'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'compras' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">shopping_bag</span> Compras
            </button>
            <button
              onClick={() => { onNavigate('nueva-orden-compra'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'nueva-orden-compra' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">note_add</span> Nueva Orden Compra
            </button>
            <button
              onClick={() => { onNavigate('registrar-remito'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'registrar-remito' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span> Registrar Remito
            </button>
            <button
              onClick={() => { onNavigate('finanzas'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'finanzas' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span> Finanzas
            </button>
            <button
              onClick={() => { onNavigate('reportes'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'reportes' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">bar_chart</span> Reportes
            </button>
            <button
              onClick={() => { onNavigate('configuracion'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'configuracion' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">settings</span> Configuración
            </button>
            <button
              onClick={() => { onNavigate('nuevo-usuario'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'nuevo-usuario' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">person_add</span> Nuevo Usuario
            </button>
            <button
              onClick={() => { onNavigate('log-auditoria'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'log-auditoria' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">shield_with_heart</span> Log de Auditoría
            </button>
            <button
              onClick={() => { onNavigate('auth-login'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors col-span-2 ${currentView === 'auth-login' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">lock</span> Autenticación (Login/Registro)
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
