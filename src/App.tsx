import React, { useCallback, useEffect, useState } from 'react';
import {
  ViewPath, Product, PurchaseOrder, Supplier, SaleTransaction, PublicOrder, User, AuditLog, FinanceTransaction,
} from './types';
import {
  INITIAL_PURCHASE_ORDERS,
  INITIAL_SUPPLIERS,
  INITIAL_SALES,
  INITIAL_PUBLIC_ORDERS,
  INITIAL_USERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_FINANCE_TXS,
} from './data/mockData';
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

export default function App() {
  const { user, logout } = useAuth();
  const [currentView, setCurrentView] = useState<ViewPath>(user ? 'dashboard' : 'auth-login');
  const [searchTerm, setSearchTerm] = useState('');

  // Global State Collections
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(INITIAL_PURCHASE_ORDERS);
  const [suppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [sales, setSales] = useState<SaleTransaction[]>(INITIAL_SALES);
  const [publicOrders] = useState<PublicOrder[]>(INITIAL_PUBLIC_ORDERS);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);
  const [financeTxs] = useState<FinanceTransaction[]>(INITIAL_FINANCE_TXS);

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

  useEffect(() => {
    if (user) {
      void loadProducts();
    } else {
      setProducts([]);
      setProductWarehouseIds({});
    }
  }, [user, loadProducts]);

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
      clientName: payload.clientName,
      clientType: 'Retail',
      amount: Number(doc.total),
      paymentStatus: 'Pagado',
      fulfillmentStatus: 'Nuevo',
      paymentMethod: payload.method,
      itemsCount: totalItems,
    };
    setSales((prev) => [sale, ...prev]);
    await loadProducts();
    return sale;
  };

  const handleAddUser = (newUser: User) => {
    setUsers((prev) => [...prev, newUser]);
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
            <PublicClientStoreView products={products} onNavigate={setCurrentView} />
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
            {currentView === 'dashboard' && <DashboardView onNavigate={setCurrentView} />}
            {currentView === 'inventario' && <InventoryView products={products} onNavigate={setCurrentView} />}
            {currentView === 'inventario-ajuste' && (
              <StockAdjustmentView products={products} onNavigate={setCurrentView} onApplyAdjustment={handleApplyAdjustment} />
            )}
            {currentView === 'inventario-transferencia' && (
              <StockTransferView products={products} onNavigate={setCurrentView} />
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
              <NewPurchaseOrderView suppliers={suppliers} onNavigate={setCurrentView} />
            )}
            {currentView === 'registrar-remito' && (
              <GoodsReceiptView orders={purchaseOrders} onNavigate={setCurrentView} />
            )}
            {currentView === 'finanzas' && <FinanceView transactions={financeTxs} onNavigate={setCurrentView} />}
            {currentView === 'reportes' && (
              <ReportsView products={products} sales={sales} onNavigate={setCurrentView} />
            )}
            {currentView === 'configuracion' && <SettingsView users={users} onNavigate={setCurrentView} />}
            {currentView === 'nuevo-usuario' && (
              <NewUserView onAddUser={handleAddUser} onNavigate={setCurrentView} />
            )}
            {currentView === 'log-auditoria' && <AuditLogView logs={auditLogs} onNavigate={setCurrentView} />}
          </main>
        </div>
      </div>
    </div>
  );
}