import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ViewPath, Product, PurchaseOrder, Supplier, SaleTransaction, PublicOrder, User, AuditLog, FinanceTransaction, PurchaseDocument, WarehouseOption, DashboardData, RoleOption, TaxRate,
} from './types';
import { useAuth } from './lib/auth';
import { apiFetch } from './lib/api';
import { deriveBranches, getStoredBranchId, setStoredBranchId, warehouseIdsForBranch } from './lib/branch';
import { ApiProduct, ApiDocument, toFrontProduct, toFrontPurchaseOrder, toFrontPurchaseDocument, toFrontSale } from './lib/mappers';
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
import { PricingView } from './components/views/PricingView';
import { PurchasesView } from './components/views/PurchasesView';
import { NewPurchaseOrderView } from './components/views/NewPurchaseOrderView';
import { GoodsReceiptView } from './components/views/GoodsReceiptView';
import { RegistrarFacturaView } from './components/views/RegistrarFacturaView';
import { RemitoSalidaView } from './components/views/RemitoSalidaView';
import { FinanceView } from './components/views/FinanceView';
import { ReportsView } from './components/views/ReportsView';
import { SettingsView } from './components/views/SettingsView';
import { AdminView } from './components/views/AdminView';
import { NewUserView } from './components/views/NewUserView';
import { AuditLogView } from './components/views/AuditLogView';
import { AuthLoginView } from './components/views/AuthLoginView';
import { AuthRegisterView } from './components/views/AuthRegisterView';

// ---- API -> front mapper ------------------------------------------------
// Mappers live in src/lib/mappers.ts (unit-tested). Imported above.

// Public storefront entry: /t/:slug boots straight into that tenant's portal
// with no login. No react-router in this codebase (state-based navigation), so
// the pathname is parsed once at boot.
function getPublicStoreSlug(): string | null {
  const match = window.location.pathname.match(/^\/t\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function App() {
  const { user, logout, loading } = useAuth();
  // bootSlug is the anonymous entry (/t/:slug). It wins over the session's own
  // company slug: whoever opens that link sees THAT tenant's storefront.
  const [bootSlug] = useState<string | null>(getPublicStoreSlug);
  const [currentView, setCurrentView] = useState<ViewPath>(bootSlug ? 'portal-clientes' : 'auth-login');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // The entry point decides the invoice direction: Compras -> compra (ingreso),
  // Ventas -> venta (egreso). The form no longer asks for it.
  const [facturaDirection, setFacturaDirection] = useState<'ingreso' | 'egreso'>('ingreso');

  // Navegación central: cambia de vista y cierra el drawer mobile siempre.
  const navigate = useCallback((view: ViewPath) => {
    setCurrentView(view);
    setSidebarOpen(false);
  }, []);

  const openRegistrarFactura = useCallback((direction: 'ingreso' | 'egreso') => {
    setFacturaDirection(direction);
    navigate('registrar-factura');
  }, [navigate]);

  // Global State Collections
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [openOrders, setOpenOrders] = useState<PurchaseDocument[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [sales, setSales] = useState<SaleTransaction[]>([]);
  // Raw documents used as source/copy bases for facturas and remitos de salida.
  const [salesDocs, setSalesDocs] = useState<ApiDocument[]>([]);
  const [remitoDocs, setRemitoDocs] = useState<ApiDocument[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [financeTxs, setFinanceTxs] = useState<FinanceTransaction[]>([]);
  const [publicOrders, setPublicOrders] = useState<PublicOrder[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userRoles, setUserRoles] = useState<RoleOption[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [taxes, setTaxes] = useState<TaxRate[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Maps front product id -> first warehouse id (used for stock adjustments).
  const [productWarehouseIds, setProductWarehouseIds] = useState<Record<string, number>>({});

  // Fase 1 — branch/sucursal selector: client-side only, persisted per company.
  // Locked users (user.branchId set) are forced to their branch: stored value
  // is ignored and overwritten. Owners keep the free selector ("Todas" = null).
  const companyId = user?.company?.id ?? null;
  const lockedBranchId = user?.branchId ?? null;
  const branches = useMemo(() => deriveBranches(warehouses), [warehouses]);
  const [activeBranchId, setActiveBranchId] = useState<number | null>(null);
  useEffect(() => {
    if (lockedBranchId != null) {
      setStoredBranchId(companyId, lockedBranchId);
      setActiveBranchId(
        branches.length === 0 || branches.some((b) => b.id === lockedBranchId)
          ? lockedBranchId
          : null,
      );
      return;
    }
    const stored = getStoredBranchId(companyId);
    setActiveBranchId(stored != null && branches.some((b) => b.id === stored) ? stored : null);
  }, [companyId, branches, lockedBranchId]);
  const handleBranchChange = useCallback(
    (branchId: number | null) => {
      // Locked users cannot switch branches — ignore silently.
      if (lockedBranchId != null) return;
      setStoredBranchId(companyId, branchId);
      setActiveBranchId(branchId);
    },
    [companyId, lockedBranchId],
  );
  const branchWarehouseIds = useMemo(
    () => warehouseIdsForBranch(warehouses, activeBranchId),
    [warehouses, activeBranchId],
  );
  const activeBranchName = branches.find((b) => b.id === activeBranchId)?.name;

  const loadProducts = useCallback(async (): Promise<boolean> => {
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
      return true;
    } catch (err) {
      console.error('No se pudieron cargar los productos', err);
      return false;
    }
  }, []);

  const loadPurchases = useCallback(async (): Promise<boolean> => {
    try {
      const [ocs, compras, remitos, facturas, sups, whs] = await Promise.all([
        apiFetch<ApiDocument[]>('/api/documents?type=OC'),
        apiFetch<ApiDocument[]>('/api/documents?type=COMPRA'),
        apiFetch<ApiDocument[]>('/api/documents?type=REMITO'),
        apiFetch<ApiDocument[]>('/api/documents?type=FACTURA'),
        apiFetch<{ id: number; name: string; email: string; phone: string | null; taxId: string | null; contact: string | null }[]>('/api/suppliers'),
        apiFetch<WarehouseOption[]>('/api/stock/warehouses'),
      ]);
      setSuppliers(
        sups.map((s) => ({
          id: String(s.id),
          name: s.name,
          email: s.email ?? '',
          phone: s.phone,
          taxId: s.taxId,
          contact: s.contact,
          contactPerson: s.contact ?? '',
        })),
      );
      setWarehouses(whs);
      setRemitoDocs(remitos);
      setPurchaseOrders(
        [...ocs, ...compras, ...remitos, ...facturas]
          .map(toFrontPurchaseOrder)
          .sort((a, b) => b.id.localeCompare(a.id)),
      );
      setOpenOrders(ocs.filter((o) => o.status !== 'Recibido').map(toFrontPurchaseDocument));
      return true;
    } catch (err) {
      console.error('No se pudieron cargar las compras', err);
      return false;
    }
  }, []);

  const loadSales = useCallback(async (): Promise<boolean> => {
    try {
      const [ventas, remitos] = await Promise.all([
        apiFetch<ApiDocument[]>('/api/documents?type=VENTA'),
        apiFetch<ApiDocument[]>('/api/documents?type=REMITO'),
      ]);
      setSalesDocs([...ventas, ...remitos]);
      setSales(ventas.map(toFrontSale));
      return true;
    } catch (err) {
      console.error('No se pudieron cargar las ventas', err);
      return false;
    }
  }, []);

  const loadPublicOrders = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiFetch<ApiDocument[]>('/api/documents?type=PEDIDO');
      setPublicOrders(
        data.map((d) => ({
          id: `${d.type} ${d.series}-${String(d.number).padStart(4, '0')}`,
          client: d.client?.name ?? 'Sin cliente',
          clientType: d.client?.type ?? 'Mayorista',
          date: new Date(d.date).toLocaleDateString('es-ES'),
          createdAt: d.date,
          total: Number(d.total),
          paymentStatus: d.status === 'Pagado' ? 'Pagado' : 'Pendiente',
          logisticsStatus:
            d.status === 'Recibido' ? 'Enviado' : d.status === 'Parcial' ? 'En Proceso' : 'Nuevo',
        })),
      );
      return true;
    } catch (err) {
      console.error('No se pudieron cargar los pedidos públicos', err);
      return false;
    }
  }, []);

  const loadFinance = useCallback(async (): Promise<boolean> => {
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
          status: t.status,
        })),
      );
      return true;
    } catch (err) {
      console.error('No se pudieron cargar las finanzas', err);
      return false;
    }
  }, []);

  const loadDashboard = useCallback(async (): Promise<boolean> => {
    try {
      setDashboard(await apiFetch<DashboardData>('/api/dashboard'));
      return true;
    } catch (err) {
      console.error('No se pudo cargar el dashboard', err);
      return false;
    }
  }, []);

  const loadUsers = useCallback(async (): Promise<boolean> => {
    try {
      const [userList, roles] = await Promise.all([
        apiFetch<{
          id: number;
          name: string;
          email: string;
          status: string;
          lastAccess: string | null;
          roles: string[];
          branchId: number | null;
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
          branchId: u.branchId,
        })),
      );
      setUserRoles(roles);
      return true;
    } catch (err) {
      console.error('No se pudieron cargar los usuarios', err);
      return false;
    }
  }, []);

  const loadAudit = useCallback(async (): Promise<boolean> => {
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
      return true;
    } catch (err) {
      console.error('No se pudo cargar el log de auditoría', err);
      return false;
    }
  }, []);

  const loadTaxes = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiFetch<TaxRate[]>('/api/products/taxes');
      setTaxes(data);
      return true;
    } catch (err) {
      console.error('No se pudieron cargar los impuestos', err);
      return false;
    }
  }, []);

  const loadAll = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    const results = await Promise.all([
      loadProducts(),
      loadPurchases(),
      loadSales(),
      loadPublicOrders(),
      loadFinance(),
      loadDashboard(),
      loadUsers(),
      loadAudit(),
      loadTaxes(),
    ]);
    const failed = results.filter((ok) => !ok).length;
    if (failed === results.length) {
      setDataError('No se pudieron cargar los datos del sistema. Revisá tu conexión e intentá de nuevo.');
    } else if (failed > 0) {
      setDataError('Algunos datos no se pudieron cargar. Se muestra la información disponible.');
    }
    setDataLoading(false);
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

  // Mantener el drawer cerrado al pasar a desktop y bloquear el scroll de fondo en mobile.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setSidebarOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  // Keep the view consistent with the session state. The anonymous storefront
  // (/t/:slug) is the exception: it never requires a session.
  useEffect(() => {
    if (user && (currentView === 'auth-login' || currentView === 'auth-register')) {
      setCurrentView('dashboard');
    }
    if (!user && currentView !== 'auth-login' && currentView !== 'auth-register') {
      if (!(currentView === 'portal-clientes' && bootSlug)) {
        setCurrentView('auth-login');
      }
    }
  }, [user, currentView, bootSlug]);

  // Handlers --------------------------------------------------------------

  const handleAddProduct = async (newProduct: Omit<Product, 'id'>) => {
    try {
      const categories = await apiFetch<{ id: number; name: string }[]>('/api/products/categories');
      const categoryId = categories.find((c) => c.name === newProduct.category)?.id;
      const body: Record<string, unknown> = {
        name: newProduct.name,
        internalCode: newProduct.sku,
        description: newProduct.description,
        salePrice: newProduct.price,
        costPrice: newProduct.costPrice ?? 0,
        categoryId,
        taxId: newProduct.taxId ?? taxes.find((t) => t.active && t.rate === newProduct.taxRate)?.id,
        allowOversell: newProduct.allowOversell ?? false,
        active: true,
      };
      if (newProduct.stockInicial != null && newProduct.stockInicial > 0 && newProduct.warehouseId) {
        body.stockInicial = newProduct.stockInicial;
        body.warehouseId = newProduct.warehouseId;
      }
      await apiFetch('/api/products', { method: 'POST', body });
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
    // POS always runs on one branch: the sale must come from a warehouse of
    // the active branch (first cart line with availability there). No
    // cross-branch fallback — without stock in branch there is no sale.
    const pickWarehouse = (productId: string): number | undefined => {
      if (branchWarehouseIds != null) {
        const prod = products.find((p) => p.id === productId);
        return prod?.stocks.find(
          (s) => branchWarehouseIds.has(s.warehouseId) && (s.quantity > 0 || prod.allowOversell),
        )?.warehouseId;
      }
      return productWarehouseIds[productId];
    };
    const warehouseId = pickWarehouse(payload.items[0]?.product.id ?? '');
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
    branchId?: number | null;
  }

  const handleAddUser = async (payload: AddUserPayload) => {
    const parts = payload.name.trim().split(/\s+/);
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ') || firstName;
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: { firstName, lastName, email: payload.email, password: payload.password, roleId: payload.roleId, branchId: payload.branchId ?? null },
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
    externalNumber?: string,
    date?: string,
    notes?: string,
  ) => {
    try {
      await apiFetch(`/api/documents/${orderId}/receive`, {
        method: 'POST',
        body: { items, warehouseId, externalNumber, date, notes },
      });
      await loadAll();
    } catch (err) {
      console.error('No se pudo registrar la recepción', err);
      throw err;
    }
  };

  interface InvoiceInput {
    invoiceType: string;
    cae?: string;
    caeDueDate?: string;
    puntoVenta?: number;
  }

  interface CreateFacturaPayload {
    direction: 'ingreso' | 'egreso';
    sourceDocumentId?: number;
    supplierId?: number;
    clientId?: number;
    clientName?: string;
    items: { productId: number; quantity: number; unitPrice: number }[];
    invoice: InvoiceInput;
    externalNumber?: string;
    paymentMethod?: string;
    notes?: string;
  }

  const handleCreateFactura = async (payload: CreateFacturaPayload) => {
    try {
      const body: Record<string, unknown> = {
        type: 'FACTURA',
        series: 'A',
        items: payload.items,
        invoice: {
          invoiceType: payload.invoice.invoiceType,
          cae: payload.invoice.cae || undefined,
          caeDueDate: payload.invoice.caeDueDate || undefined,
          puntoVenta: payload.invoice.puntoVenta || undefined,
        },
        externalNumber: payload.externalNumber,
        paymentMethod: payload.paymentMethod,
        notes: payload.notes,
      };
      if (payload.direction === 'ingreso') {
        if (!payload.supplierId) throw new Error('Seleccione el proveedor de la factura.');
        body.supplierId = payload.supplierId;
        body.sourceDocumentId = payload.sourceDocumentId;
      } else {
        if (!payload.clientId && !payload.clientName) {
          throw new Error('Seleccione el cliente o documento origen.');
        }
        body.clientId = payload.clientId;
        body.clientName = payload.clientName;
        body.sourceDocumentId = payload.sourceDocumentId;
      }
      await apiFetch('/api/documents', { method: 'POST', body });
      await loadAll();
    } catch (err) {
      console.error('No se pudo registrar la factura', err);
      throw err;
    }
  };

  interface RegisterRemitoSalidaPayload {
    sourceDocumentId: number;
    clientId: number;
    items: { productId: number; quantity: number; unitPrice: number }[];
    externalNumber?: string;
    notes?: string;
  }

  const handleRegisterRemitoSalida = async (payload: RegisterRemitoSalidaPayload) => {
    try {
      await apiFetch('/api/documents', {
        method: 'POST',
        body: {
          type: 'REMITO',
          series: 'A',
          sourceDocumentId: payload.sourceDocumentId,
          clientId: payload.clientId,
          items: payload.items,
          externalNumber: payload.externalNumber,
          notes: payload.notes,
        },
      });
      await loadAll();
    } catch (err) {
      console.error('No se pudo registrar el remito de salida', err);
      throw err;
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentView('auth-login');
  };

  // Views that don't display the admin shell (Sidebar + Header)
  const isPublicOrAuth = ['portal-clientes', 'auth-login', 'auth-register', 'pricing'].includes(currentView);

  // Session restore in flight: render nothing that depends on the session yet.
  if (loading) {
    return (
      <div className="min-h-screen bg-surface font-sans text-on-surface flex items-center justify-center">
        <div
          className="animate-spin rounded-full w-10 h-10 border-4 border-primary border-t-transparent"
          role="status"
          aria-label="Cargando"
        />
      </div>
    );
  }

if (isPublicOrAuth) {
    // Anonymous /t/:slug entry wins; otherwise the logged-in portal shows the
    // session's own company storefront. Either way no auth is needed to BUY.
    const storeSlug = bootSlug ?? user?.company?.slug ?? null;
    return (
      <div className="min-h-screen bg-surface font-sans text-on-surface">
          {currentView === 'portal-clientes' && storeSlug && (
            <PublicClientStoreView slug={storeSlug} onNavigate={navigate} />
          )}
          {currentView === 'portal-clientes' && !storeSlug && !user && (
            <AuthLoginView onNavigate={navigate} onLoginSuccess={() => setCurrentView('dashboard')} />
          )}
          {currentView === 'portal-clientes' && !storeSlug && user && (
            <div className="min-h-screen flex flex-col items-center justify-center gap-md p-lg text-center">
              <span className="material-symbols-outlined text-[48px] text-on-surface-variant">storefront</span>
              <h1 className="font-headline-lg text-headline-lg">Tu tienda aún no tiene enlace público</h1>
              <p className="font-body-md text-on-surface-variant max-w-[28rem]">
                Configurá el slug del storefront en Configuración → Datos de la Empresa para activar tu tienda pública.
              </p>
              <button
                onClick={() => navigate('configuracion')}
                className="px-md py-sm bg-primary text-on-primary rounded-lg font-label-md text-label-md cursor-pointer"
              >
                Ir a Configuración
              </button>
            </div>
          )}
          {currentView === 'auth-login' && !user && (
            <AuthLoginView onNavigate={navigate} onLoginSuccess={() => setCurrentView('dashboard')} />
          )}
          {currentView === 'auth-register' && (
            <AuthRegisterView onNavigate={navigate} onRegisterSuccess={() => setCurrentView('dashboard')} />
          )}
          {currentView === 'pricing' && <PricingView onNavigate={navigate} />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface font-sans text-on-surface flex flex-col">
      <div className="flex flex-1 min-h-screen">
        {/* Main ERP Admin Sidebar */}
        <Sidebar
          currentView={currentView}
          facturaDirection={facturaDirection}
          onNavigate={navigate}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main ERP Content Area */}
        <div className="flex-1 lg:pl-64 flex flex-col min-h-screen min-w-0">
          {/* ERP Top Bar Header */}
          <Header
            currentView={currentView}
            onNavigate={navigate}
            onLogout={handleLogout}
            onMenuClick={() => setSidebarOpen(true)}
            branches={branches}
            activeBranchId={activeBranchId}
            onBranchChange={handleBranchChange}
          />

          {/* View Container — POS usa full-bleed (sin padding del shell) */}
          <main
            className={
              currentView === 'pos'
                ? 'flex-1 flex flex-col pt-16 overflow-hidden'
                : 'pt-20 p-lg flex-1 flex flex-col max-w-[1600px] w-full mx-auto'
            }
          >
            {dataError && (
              <div className="mb-md flex items-center justify-between gap-md bg-error-container/40 border border-error/30 rounded-xl px-md py-sm">
                <p className="font-body-md text-body-md text-on-error-container">{dataError}</p>
                <button
                  onClick={() => void loadAll()}
                  className="shrink-0 px-md py-xs rounded-lg border border-error/40 text-error font-label-md text-label-md hover:bg-error-container transition-colors cursor-pointer"
                >
                  Reintentar
                </button>
              </div>
            )}

            {dataLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-md py-20">
                <div
                  className="animate-spin rounded-full w-10 h-10 border-4 border-primary border-t-transparent"
                  role="status"
                  aria-label="Cargando datos"
                />
                <p className="font-body-lg text-body-lg text-on-surface-variant">Cargando datos...</p>
              </div>
            ) : (
              <>
            {currentView === 'dashboard' && <DashboardView dashboard={dashboard} onNavigate={navigate} />}
            {currentView === 'inventario' && (
              <InventoryView
                products={products}
                warehouses={warehouses}
                activeBranchId={activeBranchId}
                activeBranchName={activeBranchName}
                branchLocked={lockedBranchId != null}
                onClearBranch={() => handleBranchChange(null)}
                onNavigate={navigate}
              />
            )}
            {currentView === 'inventario-ajuste' && (
              <StockAdjustmentView products={products} onNavigate={navigate} onApplyAdjustment={handleApplyAdjustment} />
            )}
            {currentView === 'inventario-transferencia' && (
              <StockTransferView
                products={products}
                warehouses={warehouses}
                onTransfer={handleTransferStock}
                onNavigate={navigate}
              />
            )}
            {currentView === 'inventario-nuevo-producto' && (
              <AddProductView
                onAddProduct={handleAddProduct}
                onNavigate={navigate}
                taxes={taxes}
                warehouses={warehouses}
              />
            )}
            {currentView === 'pos' && (
              <PosView
                products={products}
                branches={branches}
                activeBranchId={activeBranchId}
                branchWarehouseIds={branchWarehouseIds}
                activeBranchName={activeBranchName}
                onClearBranch={() => handleBranchChange(null)}
                onSelectBranch={handleBranchChange}
                branchLocked={lockedBranchId != null}
                onCompleteSale={handleCompleteSale}
                onNavigate={navigate}
              />
            )}
            {currentView === 'ventas' && (
              <SalesView sales={sales} onNavigate={navigate} onOpenRegistrarFactura={() => openRegistrarFactura('egreso')} />
            )}
            {currentView === 'pedidos-publicos' && (
              <PublicOrdersView orders={publicOrders} onNavigate={navigate} />
            )}
            {currentView === 'nuevo-pedido-manual' && <NewManualOrderView products={products} onNavigate={navigate} />}
            {currentView === 'compras' && (
              <PurchasesView
                orders={purchaseOrders}
                suppliers={suppliers}
                onNavigate={navigate}
                onSupplierCreated={loadPurchases}
                onOpenRegistrarFactura={() => openRegistrarFactura('ingreso')}
              />
            )}
            {currentView === 'nueva-orden-compra' && (
              <NewPurchaseOrderView
                suppliers={suppliers}
                products={products}
                warehouses={warehouses}
                onCreateOrder={handleCreatePurchaseOrder}
                onNavigate={navigate}
              />
            )}
            {currentView === 'registrar-remito' && (
              <GoodsReceiptView
                orders={openOrders}
                warehouses={warehouses}
                products={products}
                onReceive={handleReceivePurchaseOrder}
                onNavigate={navigate}
              />
            )}
            {currentView === 'registrar-factura' && (
              <RegistrarFacturaView
                suppliers={suppliers}
                salesDocs={salesDocs}
                remitoDocs={remitoDocs}
                products={products}
                direction={facturaDirection}
                onCreateFactura={handleCreateFactura}
                onNavigate={navigate}
              />
            )}
            {currentView === 'remito-salida' && (
              <RemitoSalidaView
                salesDocs={salesDocs}
                products={products}
                onRegisterRemitoSalida={handleRegisterRemitoSalida}
                onNavigate={navigate}
              />
            )}
            {currentView === 'finanzas' && <FinanceView transactions={financeTxs} onNavigate={navigate} />}
            {currentView === 'reportes' && (
              <ReportsView products={products} sales={sales} onNavigate={navigate} />
            )}
            {currentView === 'configuracion' && (
              <SettingsView
                taxes={taxes}
                onAddTax={handleAddTax}
                onToggleTax={handleToggleTax}
                onNavigate={navigate}
              />
            )}
            {currentView === 'administracion' && (
              <AdminView users={users} roles={userRoles} permissions={user?.permissions ?? []} onNavigate={navigate} onRolesChanged={() => void loadUsers()} />
            )}
            {currentView === 'nuevo-usuario' && (
              <NewUserView
                roles={userRoles}
                branches={branches}
                onAddUser={handleAddUser}
                onNavigate={navigate}
              />
            )}
            {currentView === 'log-auditoria' && <AuditLogView logs={auditLogs} onNavigate={navigate} />}
            </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}