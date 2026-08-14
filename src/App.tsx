import React, { useState } from 'react';
import { ViewPath, Product, PurchaseOrder, Supplier, SaleTransaction, PublicOrder, User, AuditLog, FinanceTransaction } from './types';
import {
  INITIAL_PRODUCTS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_SUPPLIERS,
  INITIAL_SALES,
  INITIAL_PUBLIC_ORDERS,
  INITIAL_USERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_FINANCE_TXS,
} from './data/mockData';

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

export default function App() {
  const [currentView, setCurrentView] = useState<ViewPath>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');

  // Global State Collections
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(INITIAL_PURCHASE_ORDERS);
  const [suppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [sales, setSales] = useState<SaleTransaction[]>(INITIAL_SALES);
  const [publicOrders] = useState<PublicOrder[]>(INITIAL_PUBLIC_ORDERS);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);
  const [financeTxs] = useState<FinanceTransaction[]>(INITIAL_FINANCE_TXS);

  // Handlers
  const handleAddProduct = (newProduct: Omit<Product, 'id'>) => {
    setProducts((prev) => [{ ...newProduct, id: Date.now().toString() }, ...prev]);
    // Log audit
    setAuditLogs((prev) => [
      {
        id: Date.now().toString(),
        timestamp: 'Ahora',
        user: 'Ana Silva',
        userInitials: 'AS',
        action: 'Creación de Producto',
        module: 'Inventario',
        ip: '192.168.1.45',
        details: `Nuevo producto agregado: ${newProduct.name} (SKU: ${newProduct.sku})`,
      },
      ...prev,
    ]);
  };

  const handleApplyAdjustment = (productId: string, delta: number) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          const stock = p.stock + delta;
          const status = stock === 0 ? 'OutOfStock' : stock <= p.minStock ? 'LowStock' : 'InStock';
          return { ...p, stock, status };
        }
        return p;
      })
    );
    // Log audit
    setAuditLogs((prev) => [
      {
        id: Date.now().toString(),
        timestamp: 'Ahora',
        user: 'Ana Silva',
        userInitials: 'AS',
        action: 'Ajuste de Stock',
        module: 'Inventario',
        ip: '192.168.1.45',
        details: `Ajuste de stock aplicado al producto ${productId} (${delta > 0 ? '+' : ''}${delta} unidades)`,
      },
      ...prev,
    ]);
  };

  const handleAddSale = (newSale: SaleTransaction) => {
    setSales((prev) => [newSale, ...prev]);
  };

  const handleAddUser = (newUser: User) => {
    setUsers((prev) => [...prev, newUser]);
  };

  // Views that don't display the admin shell (Sidebar + Header)
  const isPublicOrAuth = ['portal-clientes', 'auth-login', 'auth-register'].includes(currentView);

  return (
    <div className="min-h-screen bg-surface font-sans text-on-surface flex flex-col">
      {isPublicOrAuth ? (
        <div className="w-full min-h-screen">
          {currentView === 'portal-clientes' && (
            <PublicClientStoreView products={products} onNavigate={setCurrentView} />
          )}
          {currentView === 'auth-login' && (
            <AuthLoginView onNavigate={setCurrentView} onLoginSuccess={() => setCurrentView('dashboard')} />
          )}
          {currentView === 'auth-register' && (
            <AuthRegisterView onNavigate={setCurrentView} onRegisterSuccess={() => setCurrentView('dashboard')} />
          )}
        </div>
      ) : (
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
            />

            {/* View Container */}
            <main className="pt-20 p-lg flex-1 flex flex-col max-w-[1600px] w-full mx-auto">
              {currentView === 'dashboard' && (
                <DashboardView onNavigate={setCurrentView} />
              )}
              {currentView === 'inventario' && (
                <InventoryView products={products} onNavigate={setCurrentView} />
              )}
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
                <PosView products={products} onCompleteSale={handleAddSale} onNavigate={setCurrentView} />
              )}
              {currentView === 'ventas' && (
                <SalesView sales={sales} onNavigate={setCurrentView} />
              )}
              {currentView === 'pedidos-publicos' && (
                <PublicOrdersView orders={publicOrders} onNavigate={setCurrentView} />
              )}
              {currentView === 'nuevo-pedido-manual' && (
                <NewManualOrderView onNavigate={setCurrentView} />
              )}
              {currentView === 'compras' && (
                <PurchasesView orders={purchaseOrders} suppliers={suppliers} onNavigate={setCurrentView} />
              )}
              {currentView === 'nueva-orden-compra' && (
                <NewPurchaseOrderView suppliers={suppliers} onNavigate={setCurrentView} />
              )}
              {currentView === 'registrar-remito' && (
                <GoodsReceiptView orders={purchaseOrders} onNavigate={setCurrentView} />
              )}
              {currentView === 'finanzas' && (
                <FinanceView transactions={financeTxs} onNavigate={setCurrentView} />
              )}
              {currentView === 'reportes' && (
                <ReportsView products={products} sales={sales} onNavigate={setCurrentView} />
              )}
              {currentView === 'configuracion' && (
                <SettingsView users={users} onNavigate={setCurrentView} />
              )}
              {currentView === 'nuevo-usuario' && (
                <NewUserView onAddUser={handleAddUser} onNavigate={setCurrentView} />
              )}
              {currentView === 'log-auditoria' && (
                <AuditLogView logs={auditLogs} onNavigate={setCurrentView} />
              )}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
