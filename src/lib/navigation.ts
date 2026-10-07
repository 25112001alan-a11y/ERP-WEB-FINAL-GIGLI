import type { ViewPath } from '../types';

/**
 * Única fuente de verdad de la navegación del admin shell.
 * El Sidebar consume NAV_SECTIONS + ADMIN_SECTIONS; el Header consume
 * QUICK_NAV_ITEMS (todas las pantallas). Agregar una pantalla = editar acá,
 * nunca dos listas a mano.
 */
export interface NavEntry {
  path: ViewPath;
  label: string;
  icon: string;
  /** Abre el portal público en otra pestaña (no navega el shell). */
  external?: boolean;
  /** Ocupa las dos columnas del quick nav (pantallas especiales). */
  wide?: boolean;
}

export const NAV_SECTIONS: NavEntry[] = [
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

export const ADMIN_SECTIONS: NavEntry[] = [
  { path: 'administracion', label: 'Administración', icon: 'admin_panel_settings' },
];

export const QUICK_NAV_ITEMS: NavEntry[] = [
  { path: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: 'inventario', label: 'Inventario', icon: 'inventory_2' },
  { path: 'inventario-ajuste', label: 'Ajuste de Stock', icon: 'tune' },
  { path: 'inventario-transferencia', label: 'Transferencia Stock', icon: 'swap_horiz' },
  { path: 'inventario-nuevo-producto', label: 'Agregar Producto', icon: 'add_box' },
  { path: 'pos', label: 'Punto de Venta (POS)', icon: 'point_of_sale' },
  { path: 'ventas', label: 'Ventas', icon: 'payments' },
  { path: 'pedidos-publicos', label: 'Pedidos Públicos', icon: 'shopping_cart_checkout' },
  { path: 'nuevo-pedido-manual', label: 'Pedido Manual', icon: 'post_add' },
  { path: 'portal-clientes', label: 'Portal de Clientes', icon: 'storefront', external: true },
  { path: 'compras', label: 'Compras', icon: 'shopping_bag' },
  { path: 'nueva-orden-compra', label: 'Nueva Orden Compra', icon: 'note_add' },
  { path: 'registrar-remito', label: 'Registrar Remito', icon: 'receipt_long' },
  { path: 'finanzas', label: 'Finanzas', icon: 'account_balance_wallet' },
  { path: 'reportes', label: 'Reportes', icon: 'bar_chart' },
  { path: 'configuracion', label: 'Configuración', icon: 'settings' },
  { path: 'nuevo-usuario', label: 'Nuevo Usuario', icon: 'person_add' },
  { path: 'log-auditoria', label: 'Log de Auditoría', icon: 'shield_with_heart' },
  { path: 'auth-login', label: 'Autenticación (Login/Registro)', icon: 'lock', wide: true },
];