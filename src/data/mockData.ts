import { Product, PurchaseOrder, Supplier, SaleTransaction, PublicOrder, User, AuditLog, FinanceTransaction } from '../types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: '1',
    sku: 'EL-LP-001',
    name: 'Laptop Pro X1',
    category: 'Electrónica',
    stock: 145,
    minStock: 10,
    price: 1299.00,
    costPrice: 850.00,
    taxRate: 16,
    status: 'InStock',
    active: true,
    warehouse: 'Depósito Central',
    description: 'Laptop corporativa de alto rendimiento con procesador Intel i7 y 16GB RAM.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCowjnDZebIqev5qatyMfw9xRkk-KPksbPbhBVdILgEQpr1yXAKa8gi_k0lbO5AMuv7Q7lcqWQgx3pUMMKfhTDegOo8ZvI_YmC1SmnjFT2-bRtxWQjx6ngxM7XUSFz5S-Eyr6QRuO4GXSuWlRSQEYIt44z7CifNvU0T8ChfoWDBbtAEC2fL536W0fb9R3maWxZciJyPecOAC_d-MwteURml1BiqgiQLXbBc9eJVHWqBT6m0oMtzwo0'
  },
  {
    id: '2',
    sku: 'EL-KB-042',
    name: 'Teclado Mecánico K2',
    category: 'Electrónica',
    stock: 12,
    minStock: 15,
    price: 89.50,
    costPrice: 45.00,
    taxRate: 16,
    status: 'LowStock',
    active: true,
    warehouse: 'Depósito Central',
    description: 'Teclado mecánico ergonómico con retroiluminación RGB sutil y switches táctiles.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDeTyDtyke8MdVaO9OTnxWhQr1WLRrz7f7BY13PKS8BqFGXs8cP-SCcXM5igdavCPvJVASy4luYKwLb_79pYjhHWNeasKXE_IELk3VCTDF4bKUtv-LUrSiBCq4HToWSy38T0fRS6uEuB1UmCrNTvGcdLx61tFvehW1VFBdL1K9xa5iSpbncsK7knO6-DvmMTBAmz7YAcJVyOIq4Tu0jTKsGVRSi8VCTXBlDbOfpZfs02NcmiBFKumA'
  },
  {
    id: '3',
    sku: 'FU-CH-105',
    name: 'Silla Ergonómica E1',
    category: 'Muebles',
    stock: 0,
    minStock: 5,
    price: 249.00,
    costPrice: 130.00,
    taxRate: 16,
    status: 'OutOfStock',
    active: true,
    warehouse: 'Tienda Norte',
    description: 'Silla de oficina ergonómica ajustable con soporte lumbar y malla transpirable.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDjcXndkSyyXga3ZxZqaqHX8H0MKMT2sn1N5gAma4jrHtlNYoJUFip3DPgRgYKO7ChAyTVkhfPyMJt_11LU-NNt3DyaEPlFYSgPab20M6RiWBzMmDiZB6rHNtLfv3RBLfhRNjtDG_CeJKzT-7xRtj3xO6nkZ9t4kT2VOCSc9GeoIsK2s_kgxbi88b-TRjJJpbQ7eDfk49b1b8JK4w2m8acCUbEX8qmlX70bhWbIhFy4eGn7rrd3hWA'
  },
  {
    id: '4',
    sku: 'CL-TS-001',
    name: 'Camiseta Básica Algodón',
    category: 'Ropa',
    stock: 850,
    minStock: 50,
    price: 19.99,
    costPrice: 8.00,
    taxRate: 16,
    status: 'InStock',
    active: true,
    warehouse: 'Depósito Central',
    description: 'Camiseta 100% algodón peinado suave, varios colores neutros.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBZs3Ta2lodtOYv2R_wbCeQqS7fLHfAhmQI1IJiH3jPVz-UlnSKx1CCxlwrHK7rZIN5Swudtgh8WheQbCJcevmSpTYBya69Fl6xjxO3jjoXrfDZzVeS_lJ-zLIo1LiES4gvtVjLUSU8sQVio8moHuag9DCTlgB1445-t07jj6v53RS2pqVrPRFqgYICiNnPrRMUSZYTzt5FwRqDGMf80GtSgV91zBYOF6uy27o79tr49l8WQCStsmM'
  },
  {
    id: '5',
    sku: 'BEB-CC-600',
    name: 'Coca-Cola Original 600ml',
    category: 'Bebidas',
    stock: 45,
    minStock: 20,
    price: 1.50,
    costPrice: 0.80,
    taxRate: 12,
    status: 'InStock',
    active: true,
    warehouse: 'Depósito Central',
    description: 'Bebida gaseosa refrescante en botella de 600ml.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA5BNa6QQv4RH3zdIoVJeXrUFWQlTqGJkvCyQAzgRPL-8rVG1k8LYOoHkQWULenCJjuA0izNO6NuUwnrIaOu3UPwMZvzW2R8nA0r7Zw2mpXYFFGsp-hIk5tODWmwkQgdFzDY3uEfZC8uLYNqkTQ2lxu3v1J96GpCihDDDhef4ubySV3fjD48gg_mek-TlysFMJuFtAC4Ih16lpmUuEtzDOrXNPiBUhq8JUbYXdQHdYFcvTxMuJUyRg'
  },
  {
    id: '6',
    sku: 'SNK-LAY-160',
    name: 'Papas Fritas Lay\'s Clásicas 160g',
    category: 'Snacks',
    stock: 2,
    minStock: 10,
    price: 2.80,
    costPrice: 1.50,
    taxRate: 12,
    status: 'LowStock',
    active: true,
    warehouse: 'Depósito Central',
    description: 'Papas crujientes saladas en bolsa familiar de 160g.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA5AMMsBdFtGfpVVBxrs50lkIjiC8G0vZnDzADOQ8PIfbDzsAIDD5OyLS9EOy9NUSyMAdrSD7b0HHMqP28h4M60J9QexRTE6HJwF_l30cwHyPHGX_PPlECJM6eMY7OuqNzUW4NjsKaIdc3OPW_-mwETvzlZBoHMcM4WixElqz3oQYP7BPU1dhj6I1g5O708ielidWV1Z8F7LuWDS3ob2a5DCk9Rdm7RykflTGW6QLYoQdY54rcWgF0'
  }
];

export const INITIAL_PURCHASE_ORDERS: PurchaseOrder[] = [
  { id: 'OC-2023-0042', date: '12 Oct 2023', supplier: 'Acme Corp Ind.', total: 12450.00, receiptStatus: 'Pendiente', paymentStatus: 'No Pagado' },
  { id: 'OC-2023-0041', date: '10 Oct 2023', supplier: 'Global Logistics LLC', total: 3200.50, receiptStatus: 'Parcial', paymentStatus: 'Pagado' },
  { id: 'OC-2023-0040', date: '08 Oct 2023', supplier: 'TechSolutions SA', total: 45900.00, receiptStatus: 'Recibido', paymentStatus: 'Pagado' },
];

export const INITIAL_SUPPLIERS: Supplier[] = [
  { id: 'SUP-001', name: 'Acme Corp Ind.', email: 'contacto@acmecorp.com', phone: '+34 912 345 678', taxId: 'A-12345678', contactPerson: 'Juan Acosta' },
  { id: 'SUP-002', name: 'Global Logistics LLC', email: 'ventas@globallogistics.com', phone: '+34 911 888 999', taxId: 'B-87654321', contactPerson: 'Laura Gómez' },
  { id: 'SUP-003', name: 'TechSolutions SA', email: 'info@techsolutions.com', phone: '+34 933 222 111', taxId: 'A-99887766', contactPerson: 'Carlos Vega' }
];

export const INITIAL_SALES: SaleTransaction[] = [
  { id: 'ORD-8921', type: 'Venta - B2B', date: '12 Oct 2023 14:32', clientName: 'Acme Corporation Ltd.', clientType: 'B2B Wholesale', amount: 12450.00, paymentStatus: 'Pagado', fulfillmentStatus: 'En Preparación', paymentMethod: 'Transferencia', itemsCount: 3 },
  { id: 'ORD-8920', type: 'Venta - Retail', date: '12 Oct 2023 11:15', clientName: 'Global Tech Industries', clientType: 'Retail Partner', amount: 3200.50, paymentStatus: 'Pendiente', fulfillmentStatus: 'Entregado', paymentMethod: 'Tarjeta Crédito', itemsCount: 2 },
  { id: 'ORD-8915', type: 'Venta - Enterprise', date: '10 Oct 2023 09:45', clientName: 'Nexus Dynamics', clientType: 'Enterprise', amount: 28900.00, paymentStatus: 'Vencido', fulfillmentStatus: 'Entregado', paymentMethod: 'Factura 30 días', itemsCount: 8 },
  { id: 'ORD-8910', type: 'Venta - B2B', date: '09 Oct 2023 16:20', clientName: 'Smith & Co.', clientType: 'B2B Client', amount: 1150.00, paymentStatus: 'Pagado', fulfillmentStatus: 'Entregado', paymentMethod: 'Efectivo', itemsCount: 1 },
  { id: 'ORD-8905', type: 'Venta - B2B', date: '08 Oct 2023 10:00', clientName: 'Delta Logistics', clientType: 'Enterprise', amount: 5400.00, paymentStatus: 'Pagado', fulfillmentStatus: 'En Preparación', paymentMethod: 'Transferencia', itemsCount: 4 }
];

export const INITIAL_PUBLIC_ORDERS: PublicOrder[] = [
  { id: '#ORD-99321', client: 'Carlos Aranda', clientType: 'B2C Retail', date: 'Hoy, 10:42 AM', total: 3450.00, paymentStatus: 'Pendiente', logisticsStatus: 'Nuevo', address: 'Av. Providencia 1234, Dpto 502, Santiago' },
  { id: '#ORD-99320', client: 'María López', clientType: 'B2B Wholesale', date: 'Ayer, 16:15 PM', total: 1245.50, paymentStatus: 'Pagado', logisticsStatus: 'En Proceso', address: 'Calle Industria 450, Bodega 3, Valparaíso' },
  { id: '#ORD-99319', client: 'Empresa Ibérica SA', clientType: 'B2B Corp', date: '12 Mar 2024', total: 14890.00, paymentStatus: 'Pagado', logisticsStatus: 'Enviado', address: 'Paseo de la Castellana 100, Madrid' },
];

export const INITIAL_USERS: User[] = [
  { id: 'U-001', name: 'Ana Silva', email: 'ana.silva@empresa.com', role: 'Super Admin', lastAccess: 'Hace 2 min', status: 'Activo', username: 'asilva' },
  { id: 'U-002', name: 'Carlos Pérez', email: 'c.perez@empresa.com', role: 'Gerente Ventas', lastAccess: 'Ayer, 14:30', status: 'Activo', username: 'cperez' },
  { id: 'U-003', name: 'María Rodríguez', email: 'm.rodriguez@empresa.com', role: 'Analista Inventario', lastAccess: 'Nunca', status: 'Pendiente', username: 'mrodriguez' }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  { id: '1', timestamp: 'Hoy, 10:45 AM', user: 'Ana Silva', userInitials: 'AS', action: 'Inicio de sesión', module: 'Seguridad', ip: '192.168.1.45', details: 'Acceso exitoso desde Chrome/Linux' },
  { id: '2', timestamp: 'Hoy, 09:12 AM', user: 'Carlos Pérez', userInitials: 'CP', action: 'Modificación de Stock', module: 'Inventario', ip: '192.168.1.22', details: 'Ajuste de inventario en SKU: PROD-001 (+50 unidades)' },
  { id: '3', timestamp: 'Ayer, 16:30 PM', user: 'María Rodríguez', userInitials: 'MR', action: 'Creación de Factura', module: 'Ventas', ip: '192.168.1.15', details: 'Factura generada #FAC-5521 por $12,450.00' }
];

export const INITIAL_FINANCE_TXS: FinanceTransaction[] = [
  { id: 'TX-8921', date: '12 Oct 2023, 14:32', concept: 'Venta POS', method: 'Tarjeta Crédito', amount: 1250.00, type: 'Ingreso', status: 'Completado' },
  { id: 'TX-8920', date: '12 Oct 2023, 13:15', concept: 'Pago Proveedor', method: 'Transferencia', amount: -3500.00, type: 'Egreso', status: 'Completado' },
  { id: 'TX-8919', date: '12 Oct 2023, 11:45', concept: 'Venta POS', method: 'Efectivo', amount: 450.50, type: 'Ingreso', status: 'Conciliado' },
  { id: 'TX-8918', date: '12 Oct 2023, 10:20', concept: 'Gasto Operativo', method: 'Caja Chica', amount: -120.00, type: 'Egreso', status: 'Completado' },
  { id: 'TX-8917', date: '12 Oct 2023, 09:05', concept: 'Apertura Caja', method: 'Efectivo', amount: 5000.00, type: 'Ingreso', status: 'Conciliado' },
];
