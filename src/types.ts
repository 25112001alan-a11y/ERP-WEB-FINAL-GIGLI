export type ViewPath = 
  | 'dashboard'
  | 'inventario'
  | 'inventario-ajuste'
  | 'inventario-transferencia'
  | 'inventario-nuevo-producto'
  | 'pos'
  | 'ventas'
  | 'pedidos-publicos'
  | 'nuevo-pedido-manual'
  | 'portal-clientes'
  | 'compras'
  | 'nueva-orden-compra'
  | 'registrar-remito'
  | 'registrar-factura'
  | 'remito-salida'
  | 'finanzas'
  | 'reportes'
  | 'configuracion'
  | 'administracion'
  | 'nuevo-usuario'
  | 'log-auditoria'
  | 'auth-login'
  | 'auth-register'
  | 'pricing';

export interface Product {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  price: number;
  costPrice: number;
  taxRate: number;
  taxId?: number;
  status: 'InStock' | 'LowStock' | 'OutOfStock';
  active: boolean;
  allowOversell?: boolean;
  stocks: { warehouseId: number; quantity: number; minStock: number }[];
  stockInicial?: number;
  warehouseId?: number;
  description?: string;
  imageUrl?: string;
}

export interface PurchaseOrder {
  id: string;
  documentId: number;
  type: string;
  date: string;
  supplier: string;
  total: number;
  receiptStatus: 'Pendiente' | 'Parcial' | 'Recibido';
  paymentStatus: 'Pagado' | 'No Pagado';
  hasExternalVoucher?: boolean;
  externalNumber?: string;
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  taxId: string | null;
  contact?: string | null;
  contactPerson?: string;
}

export interface SaleTransaction {
  id: string;
  type: string;
  date: string;
  createdAt?: string;
  clientName: string;
  clientType: string;
  clientId?: number;
  amount: number;
  paymentStatus: 'Pagado' | 'Pendiente' | 'Vencido' | 'Conciliado';
  fulfillmentStatus: 'Entregado' | 'En Preparación' | 'Nuevo';
  paymentMethod: string;
  itemsCount: number;
  items?: { description: string; quantity: number; unitPrice: number }[];
}

export interface DashboardRecent {
  id: number;
  type: string;
  label: string;
  date: string;
  amount: number;
  status: string;
  partyName: string;
}

export interface DashboardData {
  month: string;
  totalSalesMonth: number;
  totalExpensesMonth: number;
  netCashFlow: number;
  pendingOrders: number;
  lowStockCount: number;
  lowStockProducts: {
    productId: number;
    sku: string;
    name: string;
    stock: number;
    minStock: number;
    warehouse: string;
  }[];
  recent: DashboardRecent[];
  topProducts: { name: string; sku: string; units: number }[];
}

export interface PublicOrder {
  id: string;
  documentId: number;
  client: string;
  clientType: string;
  date: string;
  createdAt: string;
  total: number;
  paymentStatus: 'Pagado' | 'Pendiente';
  logisticsStatus: 'Nuevo' | 'En Proceso' | 'Enviado' | 'Anulado';
  address?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  roleId?: number;
  roles?: string[];
  lastAccess: string;
  status: 'Activo' | 'Pendiente' | 'Inactivo';
  username?: string;
  branchId?: number | null;
}

export interface RoleOption {
  id: number;
  name: string;
  description?: string | null;
  permissions?: string[];
  permissionCount?: number;
  userCount?: number;
}

export interface PermissionOption {
  id: number;
  name: string;
  description?: string | null;
}

export interface TaxRate {
  id: number;
  name: string;
  rate: number;
  active: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  userInitials: string;
  action: string;
  module: 'Seguridad' | 'Inventario' | 'Ventas' | 'Compras' | 'Finanzas' | 'Configuración';
  ip: string;
  details: string;
}

export interface FinanceTransaction {
  id: string;
  date: string;
  concept: string;
  method: string;
  amount: number;
  type: 'Ingreso' | 'Egreso';
  status: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface PurchaseItem {
  productId: string;
  name: string;
  sku: string;
  ordered: number;
  received: number;
  unitPrice: number;
}

export interface PurchaseDocument {
  id: string;
  number: string;
  type: string;
  date: string;
  supplier: string;
  total: number;
  status: string;
  externalNumber?: string;
  items: PurchaseItem[];
}

export interface WarehouseOption {
  id: number;
  name: string;
  branchId?: number;
  branch?: { id: number; name: string } | null;
}

export interface BranchOption {
  id: number;
  name: string;
}

// ---------------------------------------------------------------------------
// SaaS billing (F4)
// ---------------------------------------------------------------------------

export interface BillingPlan {
  code: string;
  name: string;
  description: string;
  priceMonthly: number;
  features: string[];
}

export interface BillingSubscription {
  status: string;
  plan: { code: string; name: string; priceMonthly: number };
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  mpSubscriptionId: string | null;
}

export interface BillingAdminOverview {
  totals: {
    companies: number;
    activeSubscriptions: number;
    pastDueSubscriptions: number;
    canceledSubscriptions: number;
    pendingSubscriptions: number;
    mrrUsd: number;
  };
  recentEvents: { eventId: string; topic: string; createdAt: string }[];
  unsubscribedCompanies: { id: number; name: string; slug: string | null }[];
}
