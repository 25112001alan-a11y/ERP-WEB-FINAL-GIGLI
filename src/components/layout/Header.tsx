import React, { useEffect, useRef, useState } from 'react';
import { ViewPath, BranchOption } from '../../types';
import { useAuth } from '../../lib/auth';

interface HeaderProps {
  currentView: ViewPath;
  onNavigate: (view: ViewPath) => void;
  onLogout: () => void;
  onMenuClick: () => void;
  branches?: BranchOption[];
  activeBranchId?: number | null;
  onBranchChange?: (branchId: number | null) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  onLogout,
  onMenuClick,
  branches = [],
  activeBranchId = null,
  onBranchChange,
}) => {
  const { user } = useAuth();
  const [showQuickNav, setShowQuickNav] = useState(false);
  const [notificationsOpen, setShowNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const quickNavRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Any click outside an open panel dismisses it (including the buttons that
  // open another one: the panels close each other in their own handlers).
  useEffect(() => {
    if (!showQuickNav && !notificationsOpen && !profileOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        quickNavRef.current?.contains(target) ||
        notificationsRef.current?.contains(target) ||
        profileRef.current?.contains(target)
      ) {
        return;
      }
      setShowQuickNav(false);
      setShowNotificationsOpen(false);
      setProfileOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showQuickNav, notificationsOpen, profileOpen]);

  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Admin User';
  const companyName = user?.company?.name ?? 'SaaS Enterprise Tenant';
  // Locked user (branchId set) sees a fixed badge; only the owner switches.
  const isLocked = user?.branchId != null;
  const lockedBranchName = isLocked
    ? (branches.find((b) => b.id === user!.branchId)?.name ?? 'Mi sucursal')
    : null;

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex items-center justify-between px-lg border-b border-outline-variant/20">
      {/* Search Input */}
      <div className="flex items-center flex-1 min-w-0 gap-md">
        {/* Hamburger (solo mobile) */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-base -ml-sm hover:bg-surface-container-high rounded-lg transition-colors cursor-pointer"
          aria-label="Abrir menú de navegación"
        >
          <span className="material-symbols-outlined text-on-surface-variant">menu</span>
        </button>
      </div>

      {/* Right User Actions */}
      <div className="flex items-center gap-lg">
        {isLocked ? (
          <span
            title="Tu usuario está asignado a esta sucursal"
            className="hidden sm:flex items-center gap-xs px-sm py-xs bg-surface-container-high rounded-lg font-label-md text-label-md text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">store</span>
            {lockedBranchName}
          </span>
        ) : (
          onBranchChange && branches.length > 0 && (
          <label className="hidden sm:flex items-center gap-xs px-sm py-xs bg-surface-container-high rounded-lg font-label-md text-label-md text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px] text-secondary">store</span>
            <select
              value={activeBranchId == null ? '' : String(activeBranchId)}
              onChange={(e) => onBranchChange(e.target.value === '' ? null : Number(e.target.value))}
              aria-label="Sucursal activa"
              title="¿En qué sucursal estoy trabajando?"
              className="bg-transparent outline-none cursor-pointer text-on-surface max-w-[160px]"
            >
              <option value="">Todas</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>{b.name}</option>
              ))}
            </select>
          </label>
          )
        )}
        <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest hidden md:inline-block max-w-[220px] truncate">
          {companyName}
        </span>

        {/* Quick View Switcher Button */}
        <button
          onClick={() => {
            setShowQuickNav(!showQuickNav);
            setShowNotificationsOpen(false);
            setProfileOpen(false);
          }}
          title="Vista Rápida de Pantallas"
          className="flex items-center gap-xs px-sm py-xs bg-surface-container-high text-on-surface hover:bg-surface-container-highest rounded-lg transition-colors font-label-md text-label-md cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] text-secondary">widgets</span>
          <span className="hidden sm:inline">Navegación</span>
        </button>

        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => {
              setShowNotificationsOpen(!notificationsOpen);
              setShowQuickNav(false);
              setProfileOpen(false);
            }}
            className="relative p-base hover:bg-surface-container-high rounded-full transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
            <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full animate-pulse"></span>
          </button>

          {notificationsOpen && (
            <div className="fixed top-16 left-md right-md sm:absolute sm:top-auto sm:left-auto sm:right-0 sm:mt-2 sm:w-80 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 p-md z-50">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-xs mb-sm">
                <span className="font-headline-md text-[14px] text-on-surface">Notificaciones</span>
                <span className="font-mono-sm text-[10px] bg-error-container text-on-error-container px-2 py-0.5 rounded-full">3 Nuevas</span>
              </div>
              <div className="space-y-sm max-h-64 overflow-y-auto">
                <div className="p-xs hover:bg-surface-container-low rounded-lg transition-colors cursor-pointer" onClick={() => { setShowNotificationsOpen(false); onNavigate('pedidos-publicos'); }}>
                  <p className="font-label-md text-on-surface">Nuevo Pedido Público #ORD-99321</p>
                  <p className="font-body-md text-xs text-on-surface-variant">Carlos Aranda - $3,450.00</p>
                </div>
                <div className="p-xs hover:bg-surface-container-low rounded-lg transition-colors cursor-pointer" onClick={() => { setShowNotificationsOpen(false); onNavigate('inventario'); }}>
                  <p className="font-label-md text-error">Alerta de Stock Bajo</p>
                  <p className="font-body-md text-xs text-on-surface-variant">Teclado Mecánico K2 (12 unidades restantes)</p>
                </div>
                <div className="p-xs hover:bg-surface-container-low rounded-lg transition-colors cursor-pointer" onClick={() => { setShowNotificationsOpen(false); onNavigate('finanzas'); }}>
                  <p className="font-label-md text-on-tertiary-container">Conciliación Bancaria</p>
                  <p className="font-body-md text-xs text-on-surface-variant">Transacción TX-8921 recibida con éxito</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="flex items-center gap-sm pl-0 sm:pl-md border-l-0 sm:border-l border-outline-variant relative" ref={profileRef}>
          <div className="text-right hidden lg:block">
            <p className="text-body-md font-bold leading-tight">{displayName}</p>
            <p className="text-mono-sm text-on-surface-variant uppercase">{user?.roles[0] ?? 'Super Administrador'}</p>
          </div>
          <button
            onClick={() => {
              setProfileOpen(!profileOpen);
              setShowQuickNav(false);
              setShowNotificationsOpen(false);
            }}
            title="Mi cuenta"
            className="w-8 h-8 rounded-full bg-primary hover:bg-primary-container transition-colors flex items-center justify-center text-on-primary cursor-pointer tap-target"
          >
            <span className="material-symbols-outlined text-[18px]">person</span>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-10 mt-2 w-64 max-w-[calc(100vw-3rem)] bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 p-md z-50">
              <div className="border-b border-outline-variant/20 pb-sm mb-sm">
                <p className="font-headline-md text-[14px] text-on-surface">{displayName}</p>
                <p className="font-body-md text-xs text-on-surface-variant truncate">{user?.email}</p>
                <p className="font-mono-sm text-[10px] text-primary uppercase mt-xs">{companyName}</p>
              </div>
              <button
                onClick={() => { setProfileOpen(false); onLogout(); }}
                className="w-full text-left px-sm py-xs rounded-lg hover:bg-error-container hover:text-on-error-container text-error font-label-md text-label-md transition-colors cursor-pointer flex items-center gap-xs"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Navigation Drawer/Modal */}
      {showQuickNav && (
        <div ref={quickNavRef} className="absolute top-16 right-lg w-[min(90vw,24rem)] bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/30 p-lg z-50">
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
              onClick={() => { const slug = user?.company?.slug; if (slug) window.open(`${window.location.origin}/t/${slug}`, '_blank', 'noopener'); setShowQuickNav(false); }}
              className={`text-left p-sm rounded-lg font-body-md text-xs flex items-center gap-xs transition-colors ${currentView === 'portal-clientes' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'hover:bg-surface-container-low text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[16px]">storefront</span> Portal de Clientes <span className="material-symbols-outlined text-[14px] opacity-60">open_in_new</span>
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
