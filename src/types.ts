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
  | 'finanzas'
  | 'reportes'
  | 'configuracion'
  | 'nuevo-usuario'
  | 'log-auditoria'
  | 'auth-login'
  | 'auth-register';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  price: number;
  costPrice: number;
  taxRate: number;
  status: 'InStock' | 'LowStock' | 'OutOfStock';
  active: boolean;
  allowOversell?: boolean;
  warehouse: string;
  description?: string;
  imageUrl?: string;
}

export interface PurchaseOrder {
  id: string;
  date: string;
  supplier: string;
  total: number;
  receiptStatus: 'Pendiente' | 'Parcial' | 'Recibido';
  paymentStatus: 'Pagado' | 'No Pagado';
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  taxId: string;
  contactPerson: string;
}

export interface SaleTransaction {
  id: string;
  type: string;
  date: string;
  createdAt?: string;
  clientName: string;
  clientType: string;
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
  client: string;
  clientType: string;
  date: string;
  total: number;
  paymentStatus: 'Pagado' | 'Pendiente';
  logisticsStatus: 'Nuevo' | 'En Proceso' | 'Enviado';
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
}

export interface RoleOption {
  id: number;
  name: string;
  description?: string;
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
  status: 'Completado' | 'Conciliado';
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
  items: PurchaseItem[];
}

export interface WarehouseOption {
  id: number;
  name: string;
}
