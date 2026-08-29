import React, { useCallback, useEffect, useState } from 'react';
import {
  ViewPath, Product, PurchaseOrder, Supplier, SaleTransaction, PublicOrder, User, AuditLog, FinanceTransaction, PurchaseDocument, WarehouseOption, DashboardData, RoleOption, TaxRate,
} from './types';
import { useAuth } from './lib/auth';
import { apiFetch } from './lib/api';
import { CartItem } from './types';

// Layout components
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';

// Views
import { DashboardView } from './components/views/DashboardView';
import { InventoryView } from './components/views/InventoryView';
import { StockAdjustmentView } from './components/views/StockAdjustmentView';
import { StockTransferView } from './components/views/StockTransferView';
import { AddProductView } from './components/views/AddProductView';
import { PosView } from './components/views/PosView';
import { SalesView } from './components/views/SalesView';
import { PublicOrdersView } from './components/views/PublicOrdersView';
import { NewManualOrderView } from './components/views/NewManualOrderView';
import { PublicClientStoreView } from './components/views/PublicClientStoreView';
import { PurchasesView } from './components/views/PurchasesView';
import { NewPurchaseOrderView } from './components/views/NewPurchaseOrderView';
import { GoodsReceiptView } from './components/views/GoodsReceiptView';
import { FinanceView } from './components/views/FinanceView';
import { ReportsView } from './components/views/ReportsView';
import { SettingsView } from './components/views/SettingsView';
import { NewUserView } from './components/views/NewUserView';
import { AuditLogView } from './components/views/AuditLogView';
import { AuthLoginView } from './components/views/AuthLoginView';
import { AuthRegisterView } from './components/views/AuthRegisterView';

// ---- API -> front mapper ------------------------------------------------

interface ApiProduct {
  id: number;
  internalCode: string | null;
  name: string;
  description: string | null;
  salePrice: string | number;
  costPrice: string | number;
  category: { name: string } | null;
  tax: { name: string; rate: number };
  stocks: { warehouseId: number; quantity: string | number; minStock: string | number }[];
  active: boolean;
  allowOversell: boolean;
}

function toFrontProduct(p: ApiProduct): Product {
  const totalStock = p.stocks.reduce((acc, s) => acc + Number(s.quantity), 0);
  const minStock = p.stocks.reduce((acc, s) => acc + Number(s.minStock), 0);
  const status: Product['status'] =
    totalStock <= 0 ? 'OutOfStock' : totalStock <= minStock ? 'LowStock' : 'InStock';
  return {
    id: String(p.id),
    sku: p.internalCode ?? '',
    name: p.name,
    category: p.category?.name ?? 'Sin categoría',
    stock: totalStock,
    minStock,
    price: Number(p.salePrice),
    costPrice: Number(p.costPrice),
    taxRate: p.tax.rate,
    status,
    active: p.active,
    allowOversell: p.allowOversell,
    warehouse: '',
    description: p.description ?? undefined,
  };
}

interface ApiDocument {
  id: number;
  type: string;
  series: string;
  number: number;
  date: string;
  status: string;
  subtotal: string | number;
  totalTax: string | number;
  total: string | number;
  supplier: { id: number; name: string } | null;
  client: { id: number; name: string; type: string | null } | null;
  payments?: { id: number; method: string; status: string }[];
  items: {
    id: number;
    productId: number | null;
    description: string;
    quantity: string | number;
    unitPrice: string | number;
    lineTotal: string | number;
  }[];
}

const RECEIPT_STATUS: Record<string, PurchaseOrder['receiptStatus']> = {
  Abierto: 'Pendiente',
  Parcial: 'Parcial',
  Recibido: 'Recibido',
};

function toFrontPurchaseOrder(d: ApiDocument): PurchaseOrder {
  return {
    id: `${d.type}-${d.series}-${String(d.number).padStart(4, '0')}`,
    date: new Date(d.date).toLocaleDateString(),
    supplier: d.supplier?.name ?? d.client?.name ?? 'Sin entidad',
    total: Number(d.total),
    receiptStatus: RECEIPT_STATUS[d.status] ?? 'Pendiente',
    paymentStatus: d.status === 'Pagado' ? 'Pagado' : 'No Pagado',
  };
}

function toFrontPurchaseDocument(d: ApiDocument): PurchaseDocument {
  return {
    id: String(d.id),
    number: `${d.type} ${d.series}-${String(d.number).padStart(4, '0')}`,
    type: d.type,
    date: new Date(d.date).toLocaleDateString(),
    supplier: d.supplier?.name ?? '',
    total: Number(d.total),
    status: d.status,
    items: d.items.map((i) => ({
      productId: i.productId != null ? String(i.productId) : '',
      name: i.description,
      sku: '',
      ordered: Number(i.quantity),
      received: 0,
      unitPrice: Number(i.unitPrice ?? 0),
    })),
  };
}

function toFrontSale(d: ApiDocument): SaleTransaction {
  const payment = d.payments?.[0];
  return {
    id: String(d.id),
    type: 'Venta',
    date: new Date(d.date).toLocaleString(),
    createdAt: d.date,
    clientName: d.client?.name ?? d.supplier?.name ?? 'Sin entidad',
    clientType: d.client?.type ?? 'Retail',
    amount: Number(d.total),
    paymentStatus: d.status === 'Pagado' ? 'Pagado' : 'Pendiente',
    fulfillmentStatus: d.status === 'Pagado' ? 'Entregado' : 'Nuevo',
    paymentMethod: payment?.method ?? '—',
    itemsCount: d.items.reduce((acc, i) => acc + Number(i.quantity), 0),
    items: d.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice ?? 0),
    })),
  };
}

export default function App() {
  const { user, logout } = useAuth();
  const [currentView, setCurrentView] = useState<ViewPath>(user ? 'dashboard' : 'auth-login');
  const [searchTerm, setSearchTerm] = useState('');

  // Global State Collections
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [openOrders, setOpenOrders] = useState<PurchaseDocument[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [sales, setSales] = useState<SaleTransaction[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [financeTxs, setFinanceTxs] = useState<FinanceTransaction[]>([]);
  const [publicOrders, setPublicOrders] = useState<PublicOrder[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userRoles, setUserRoles] = useState<RoleOption[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [taxes, setTaxes] = useState<TaxRate[]>([]);

  // Maps front product id -> first warehouse id (used for stock adjustments).
  const [productWarehouseIds, setProductWarehouseIds] = useState<Record<string, number>>({});

  const loadProducts = useCallback(async () => {
    try {
      const data = await apiFetch<ApiProduct[]>('/api/products');
      setProducts(data.map(toFrontProduct));
      setProductWarehouseIds(
        Object.fromEntries(
          data
            .filter((p) => p.stocks.length > 0)
            .map((p) => [String(p.id), p.stocks[0].warehouseId]),
        ),
      );
    } catch (err) {
      console.error('No se pudieron cargar los productos', err);
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    try {
      const [ocs, compras, sups, whs] = await Promise.all([
        apiFetch<ApiDocument[]>('/api/documents?type=OC'),
        apiFetch<ApiDocument[]>('/api/documents?type=COMPRA'),
        apiFetch<{ id: number; name: string; contact: string | null }[]>('/api/suppliers'),
        apiFetch<{ id: number; name: string }[]>('/api/stock/warehouses'),
      ]);
      setSuppliers(
        sups.map((s) => ({
          id: String(s.id),
          name: s.name,
          email: '',
          phone: '',
          taxId: '',
          contactPerson: s.contact ?? '',
        })),
      );
      setWarehouses(whs);
      setPurchaseOrders(
        [...ocs.map(toFrontPurchaseOrder), ...compras.map(toFrontPurchaseOrder)].sort((a, b) =>
          b.id.localeCompare(a.id),
        ),
      );
      setOpenOrders(ocs.filter((o) => o.status !== 'Recibido').map(toFrontPurchaseDocument));
    } catch (err) {
      console.error('No se pudieron cargar las compras', err);
    }
  }, []);

  const loadSales = useCallback(async () => {
    try {
      const data = await apiFetch<ApiDocument[]>('/api/documents?type=VENTA');
      setSales(data.map(toFrontSale));
    } catch (err) {
      console.error('No se pudieron cargar las ventas', err);
    }
  }, []);

  const loadPublicOrders = useCallback(async () => {
    try {
      const data = await apiFetch<ApiDocument[]>('/api/documents?type=PEDIDO');
      setPublicOrders(
        data.map((d) => ({
          id: `${d.type} ${d.series}-${String(d.number).padStart(4, '0')}`,
          client: d.client?.name ?? 'Sin cliente',
          clientType: d.client?.type ?? 'Mayorista',
          date: new Date(d.date).toLocaleDateString('es-ES'),
          total: Number(d.total),
          paymentStatus: d.status === 'Pagado' ? 'Pagado' : 'Pendiente',
          logisticsStatus:
            d.status === 'Recibido' ? 'Enviado' : d.status === 'Parcial' ? 'En Proceso' : 'Nuevo',
        })),
      );
    } catch (err) {
      console.error('No se pudieron cargar los pedidos públicos', err);
    }
  }, []);

  const loadFinance = useCallback(async () => {
    try {
      const data = await apiFetch<
        { id: string; date: string; concept: string; method: string; amount: number; type: 'Ingreso' | 'Egreso'; status: string }[]
      >('/api/finance');
      setFinanceTxs(
        data.map((t) => ({
          id: t.id,
          date: new Date(t.date).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }),
          concept: t.concept,
          method: t.method,
          amount: t.amount,
          type: t.type,
          status: t.status === 'Conciliado' ? 'Conciliado' : 'Completado',
        })),
      );
    } catch (err) {
      console.error('No se pudieron cargar las finanzas', err);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      setDashboard(await apiFetch<DashboardData>('/api/dashboard'));
    } catch (err) {
      console.error('No se pudo cargar el dashboard', err);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const [userList, roles] = await Promise.all([
        apiFetch<{
          id: number;
          name: string;
          email: string;
          status: string;
          lastAccess: string | null;
          roles: string[];
        }[]>('/api/users'),
        apiFetch<RoleOption[]>('/api/users/roles'),
      ]);
      setUsers(
        userList.map((u) => ({
          id: String(u.id),
          name: u.name,
          email: u.email,
          role: u.roles[0] ?? 'Sin rol',
          roles: u.roles,
          lastAccess: u.lastAccess ? new Date(u.lastAccess).toLocaleString('es-ES') : 'Nunca',
          status: u.status === 'Activo' ? 'Activo' : u.status === 'Inactivo' ? 'Inactivo' : 'Pendiente',
        })),
      );
      setUserRoles(roles);
    } catch (err) {
      console.error('No se pudieron cargar los usuarios', err);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const data = await apiFetch<
        {
          id: number;
          timestamp: string;
          user: string;
          action: string;
          module: string;
          ip: string | null;
          details: string | null;
        }[]
      >('/api/audit-logs');
      setAuditLogs(
        data.map((l) => ({
          id: String(l.id),
          timestamp: new Date(l.timestamp).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }),
          user: l.user,
          userInitials: l.user
            .split(/\s+/)
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
          action: l.action,
          module: (l.module as AuditLog['module']) ?? 'Configuración',
          ip: l.ip ?? '—',
          details: l.details ?? '',
        })),
      );
    } catch (err) {
      console.error('No se pudo cargar el log de auditoría', err);
    }
  }, []);

  const loadTaxes = useCallback(async () => {
    try {
      const data = await apiFetch<TaxRate[]>('/api/products/taxes');
      setTaxes(data);
    } catch (err) {
      console.error('No se pudieron cargar los impuestos', err);
    }
  }, []);

  const loadAll = useCallback(() => {
    void loadProducts();
    void loadPurchases();
    void loadSales();
    void loadPublicOrders();
    void loadFinance();
    void loadDashboard();
    void loadUsers();
    void loadAudit();
    void loadTaxes();
  }, [loadProducts, loadPurchases, loadSales, loadPublicOrders, loadFinance, loadDashboard, loadUsers, loadAudit, loadTaxes]);

  useEffect(() => {
    if (user) {
      loadAll();
    } else {
      setProducts([]);
      setProductWarehouseIds({});
      setPurchaseOrders([]);
      setSuppliers([]);
      setOpenOrders([]);
      setWarehouses([]);
      setSales([]);
      setFinanceTxs([]);
      setDashboard(null);
      setPublicOrders([]);
      setUsers([]);
      setUserRoles([]);
      setAuditLogs([]);
      setTaxes([]);
    }
  }, [user, loadAll]);

  // Keep the view consistent with the session state.
  useEffect(() => {
    if (user && (currentView === 'auth-login' || currentView === 'auth-register')) {
      setCurrentView('dashboard');
    }
    if (!user && currentView !== 'auth-login' && currentView !== 'auth-register') {
      setCurrentView('auth-login');
    }
  }, [user, currentView]);

  // Handlers --------------------------------------------------------------

  const handleAddProduct = async (newProduct: Omit<Product, 'id'>) => {
    try {
      const categories = await apiFetch<{ id: number; name: string }[]>('/api/products/categories');
      const taxes = await apiFetch<{ id: number; rate: number }[]>('/api/products/taxes');
      const categoryId = categories.find((c) => c.name === newProduct.category)?.id;
      const tax = taxes.find((t) => t.rate === newProduct.taxRate);
      await apiFetch('/api/products', {
        method: 'POST',
        body: {
          name: newProduct.name,
          internalCode: newProduct.sku,
          description: newProduct.description,
          salePrice: newProduct.price,
          costPrice: newProduct.costPrice ?? 0,
          categoryId,
          taxId: tax?.id,
          allowOversell: newProduct.allowOversell ?? false,
          active: true,
        },
      });
      await loadProducts();
      setCurrentView('inventario');
    } catch (err) {
      console.error('No se pudo crear el producto', err);
      throw err;
    }
  };

  const handleApplyAdjustment = async (productId: string, delta: number) => {
    const warehouseId = productWarehouseIds[productId];
    if (!warehouseId) {
      console.error('Sin depósito asociado al producto', productId);
      return;
    }
    try {
      await apiFetch('/api/stock/adjust', {
        method: 'POST',
        body: { productId: Number(productId), warehouseId, delta, reason: 'Ajuste manual desde el frontend' },
      });
      await loadProducts();
    } catch (err) {
      console.error('No se pudo ajustar el stock', err);
      throw err;
    }
  };

  interface CompleteSalePayload {
    items: CartItem[];
    method: string;
    clientName: string;
  }

  const handleCompleteSale = async (payload: CompleteSalePayload): Promise<SaleTransaction> => {
    const warehouseId = productWarehouseIds[payload.items[0]?.product.id ?? ''];
    if (!warehouseId) {
      throw new Error('No se encontró un depósito para los productos del carrito');
    }

    const doc = await apiFetch<{
      id: number;
      type: string;
      series: string;
      number: number;
      total: string | number;
      items: unknown[];
    }>('/api/documents', {
      method: 'POST',
      body: {
        type: 'VENTA',
        series: 'A',
        clientName: payload.clientName,
        warehouseId,
        paymentMethod: payload.method,
        items: payload.items.map((i) => ({
          productId: Number(i.product.id),
          quantity: i.quantity,
        })),
      },
    });

    const totalItems = payload.items.reduce((acc, i) => acc + i.quantity, 0);
    const sale: SaleTransaction = {
      id: String(doc.id),
      type: 'Venta',
      date: new Date().toLocaleString(),
      createdAt: new Date().toISOString(),
      clientName: payload.clientName,
      clientType: 'Retail',
      amount: Number(doc.total),
      paymentStatus: 'Pagado',
      fulfillmentStatus: 'Entregado',
      paymentMethod: payload.method,
      itemsCount: totalItems,
      items: payload.items.map((i) => ({
        description: i.product.name,
        quantity: i.quantity,
        unitPrice: i.product.price,
      })),
    };
    setSales((prev) => [sale, ...prev]);
    await loadAll();
    return sale;
  };

  interface AddUserPayload {
    name: string;
    email: string;
    password: string;
    roleId: number;
  }

  const handleAddUser = async (payload: AddUserPayload) => {
    const parts = payload.name.trim().split(/\s+/);
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ') || firstName;
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: { firstName, lastName, email: payload.email, password: payload.password, roleId: payload.roleId },
      });
      await loadUsers();
    } catch (err) {
      console.error('No se pudo crear el usuario', err);
      throw err;
    }
  };

  const handleAddTax = async (name: string, rate: number) => {
    try {
      await apiFetch('/api/products/taxes', { method: 'POST', body: { name, rate } });
      await loadTaxes();
    } catch (err) {
      console.error('No se pudo crear el impuesto', err);
      throw err;
    }
  };

  const handleToggleTax = async (id: number, active: boolean) => {
    try {
      await apiFetch(`/api/products/taxes/${id}`, { method: 'PATCH', body: { active } });
      await loadTaxes();
    } catch (err) {
      console.error('No se pudo actualizar el impuesto', err);
      throw err;
    }
  };

  interface TransferStockPayload {
    productId: number;
    fromWarehouseId: number;
    toWarehouseId: number;
    quantity: number;
    reason?: string;
  }

  const handleTransferStock = async (payload: TransferStockPayload) => {
    try {
      await apiFetch('/api/stock/transfer', { method: 'POST', body: payload });
      await loadProducts();
    } catch (err) {
      console.error('No se pudo transferir el stock', err);
      throw err;
    }
  };

  interface CreatePurchaseOrderPayload {
    supplierId: number;
    items: { productId: number; quantity: number; unitPrice: number }[];
    warehouseId?: number;
    notes?: string;
  }

  const handleCreatePurchaseOrder = async (payload: CreatePurchaseOrderPayload) => {
    try {
      await apiFetch('/api/documents', {
        method: 'POST',
        body: {
          type: 'OC',
          series: 'A',
          supplierId: payload.supplierId,
          warehouseId: payload.warehouseId,
          notes: payload.notes,
          items: payload.items,
        },
      });
      await loadPurchases();
    } catch (err) {
      console.error('No se pudo crear la orden de compra', err);
      throw err;
    }
  };

  const handleReceivePurchaseOrder = async (
    orderId: string,
    items: { productId: number; quantity: number }[],
    warehouseId: number,
    notes?: string,
  ) => {
    try {
      await apiFetch(`/api/documents/${orderId}/receive`, {
        method: 'POST',
        body: { items, warehouseId, notes },
      });
      await loadAll();
    } catch (err) {
      console.error('No se pudo registrar la recepción', err);
      throw err;
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentView('auth-login');
  };

  // Views that don't display the admin shell (Sidebar + Header)
  const isPublicOrAuth = ['portal-clientes', 'auth-login', 'auth-register'].includes(currentView);

  if (isPublicOrAuth) {
    return (
      <div className="min-h-screen bg-surface font-sans text-on-surface flex flex-col">
        <div className="w-full min-h-screen">
          {currentView === 'portal-clientes' && (
            <PublicClientStoreView onNavigate={setCurrentView} />
          )}
          {currentView === 'auth-login' && !user && (
            <AuthLoginView onNavigate={setCurrentView} onLoginSuccess={() => setCurrentView('dashboard')} />
          )}
          {currentView === 'auth-register' && (
            <AuthRegisterView onNavigate={setCurrentView} onRegisterSuccess={() => setCurrentView('dashboard')} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface font-sans text-on-surface flex flex-col">
      <div className="flex flex-1 min-h-screen">
        {/* Main ERP Admin Sidebar */}
        <Sidebar currentView={currentView} onNavigate={setCurrentView} />

        {/* Main ERP Content Area */}
        <div className="flex-1 pl-64 flex flex-col min-h-screen">
          {/* ERP Top Bar Header */}
          <Header
            currentView={currentView}
            onNavigate={setCurrentView}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onLogout={handleLogout}
          />

          {/* View Container */}
          <main className="pt-20 p-lg flex-1 flex flex-col max-w-[1600px] w-full mx-auto">
            {currentView === 'dashboard' && <DashboardView dashboard={dashboard} onNavigate={setCurrentView} />}
            {currentView === 'inventario' && <InventoryView products={products} onNavigate={setCurrentView} />}
            {currentView === 'inventario-ajuste' && (
              <StockAdjustmentView products={products} onNavigate={setCurrentView} onApplyAdjustment={handleApplyAdjustment} />
            )}
            {currentView === 'inventario-transferencia' && (
              <StockTransferView
                products={products}
                warehouses={warehouses}
                onTransfer={handleTransferStock}
                onNavigate={setCurrentView}
              />
            )}
            {currentView === 'inventario-nuevo-producto' && (
              <AddProductView onAddProduct={handleAddProduct} onNavigate={setCurrentView} />
            )}
            {currentView === 'pos' && (
              <PosView products={products} onCompleteSale={handleCompleteSale} onNavigate={setCurrentView} />
            )}
            {currentView === 'ventas' && <SalesView sales={sales} onNavigate={setCurrentView} />}
            {currentView === 'pedidos-publicos' && (
              <PublicOrdersView orders={publicOrders} onNavigate={setCurrentView} />
            )}
            {currentView === 'nuevo-pedido-manual' && <NewManualOrderView onNavigate={setCurrentView} />}
            {currentView === 'compras' && (
              <PurchasesView orders={purchaseOrders} suppliers={suppliers} onNavigate={setCurrentView} />
            )}
            {currentView === 'nueva-orden-compra' && (
              <NewPurchaseOrderView
                suppliers={suppliers}
                products={products}
                warehouses={warehouses}
                onCreateOrder={handleCreatePurchaseOrder}
                onNavigate={setCurrentView}
              />
            )}
            {currentView === 'registrar-remito' && (
              <GoodsReceiptView
                orders={openOrders}
                warehouses={warehouses}
                products={products}
                onReceive={handleReceivePurchaseOrder}
                onNavigate={setCurrentView}
              />
            )}
            {currentView === 'finanzas' && <FinanceView transactions={financeTxs} onNavigate={setCurrentView} />}
            {currentView === 'reportes' && (
              <ReportsView products={products} sales={sales} onNavigate={setCurrentView} />
            )}
            {currentView === 'configuracion' && (
              <SettingsView
                users={users}
                taxes={taxes}
                onAddTax={handleAddTax}
                onToggleTax={handleToggleTax}
                onNavigate={setCurrentView}
              />
            )}
            {currentView === 'nuevo-usuario' && (
              <NewUserView
                roles={userRoles}
                onAddUser={handleAddUser}
                onNavigate={setCurrentView}
              />
            )}
            {currentView === 'log-auditoria' && <AuditLogView logs={auditLogs} onNavigate={setCurrentView} />}
          </main>
        </div>
      </div>
    </div>
  );
}