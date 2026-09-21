// Realistic AR demo seed: 3 companies with coherent business personalities.
// Idempotent — every insert is guarded by a find-first check (same convention
// as seed-demo-incremental.ts). Does NOT wipe anything. Safe to re-run.
//
// Run:  npx tsx prisma/seed-ar-demo.ts   (from server/)
//
// ============================================================================
// DEMO CREDENTIALS (all passwords are `password123` — demo only, never prod)
// ============================================================================
// Company                  Email                    Password     Role         Branch lock
// ------------------------ ------------------------ ------------ ------------ ----------------
// Kiosco "Lo de Marta"     dueno@lodemarta.test     password123  Super Admin  null (all access)
// Kiosco "Lo de Marta"     marta@lodemarta.test     password123  Encargado    Casa Central
// Kiosco "Lo de Marta"     cajero@lodemarta.test    password123  Cajero       Sucursal Estación
// Electrónica "TecnoSur"   dueno@tecnosur.test      password123  Super Admin  null (all access)
// Electrónica "TecnoSur"   jefe@tecnosur.test       password123  Encargado    Casa Central
// Electrónica "TecnoSur"   ventas@tecnosur.test     password123  Vendedor     Sucursal Shopping
// Ferretería "El Tornillo" dueno@eltornillo.test    password123  Super Admin  null (all access)
// Ferretería "El Tornillo" capataz@eltornillo.test  password123  Encargado    Casa Central
// Ferretería "El Tornillo" mostrador@eltornillo.test password123 Vendedor     Sucursal Ruta
// ============================================================================

import { PrismaClient, DocumentType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
  throw new Error('Refusing to seed production with the default demo password. Set ADMIN_PASSWORD.');
}
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'password123';

// Global permission catalog — same source as auth.routes.ts BASE_PERMISSIONS.
const BASE_PERMISSIONS = [
  'inventario.leer', 'inventario.escribir',
  'ventas.leer', 'ventas.escribir',
  'compras.leer', 'compras.escribir',
  'finanzas.leer', 'finanzas.escribir',
  'reportes.leer',
  'configuracion.leer', 'configuracion.escribir',
  'usuarios.leer', 'usuarios.escribir',
  'auditoria.leer',
  'billing.leer', 'billing.manage',
];

const ALL = BASE_PERMISSIONS;
const MANAGER_PERMS = [
  'inventario.leer', 'inventario.escribir',
  'ventas.leer', 'ventas.escribir',
  'compras.leer', 'compras.escribir',
  'reportes.leer', 'finanzas.leer',
];
const SALES_PERMS = ['ventas.leer', 'ventas.escribir', 'inventario.leer'];

// ---------------------------------------------------------------- types ---

interface SeedProduct {
  sku: string;
  name: string;
  category: string;
  sale: number;
  cost: number;
  tax: number; // 21 | 10.5 | 0
  qty: number; // stock @ Casa Central warehouse
  branchQty?: number; // stock @ Sucursal warehouse (omit = not stocked there)
  min: number;
}

interface SeedCompany {
  slug: string;
  name: string;
  legalName: string;
  taxId: string;
  centralBranch: string;
  centralAddress: string;
  branch2: string;
  branch2Address: string;
  categories: string[];
  products: SeedProduct[];
  clients: { name: string; type: string; taxId?: string; email?: string; phone?: string }[];
  suppliers: { name: string; taxId?: string; email?: string; phone?: string; contact?: string }[];
  users: { firstName: string; lastName: string; email: string; role: string; branch: 'central' | 'branch2' | null }[];
  roles: { name: string; description: string; perms: string[] }[];
  ventaSkus: { sku: string; qty: number }[];
  compraSkus: { sku: string; qty: number }[];
}

// ---------------------------------------------------------------- data ----

const COMPANIES: SeedCompany[] = [
  {
    slug: 'lo-de-marta',
    name: 'Kiosco Lo de Marta',
    legalName: 'Marta E. Gómez — Kiosco',
    taxId: '27-12345678-5',
    centralBranch: 'Casa Central',
    centralAddress: 'Av. San Martín 1234, Lanús',
    branch2: 'Sucursal Estación',
    branch2Address: 'H. Yrigoyen 450, Lanús Este',
    categories: ['Golosinas', 'Alfajores', 'Bebidas', 'Cigarrillos', 'Panificados', 'Snacks'],
    products: [
      { sku: 'KIO-ALF-001', name: 'Alfajor Jorgito triple 60g', category: 'Alfajores', sale: 950, cost: 620, tax: 21, qty: 240, branchQty: 120, min: 60 },
      { sku: 'KIO-ALF-002', name: 'Alfajor Havanna chocolate 60g', category: 'Alfajores', sale: 2400, cost: 1620, tax: 21, qty: 96, branchQty: 48, min: 24 },
      { sku: 'KIO-ALF-003', name: 'Alfajor Guaymallén 38g', category: 'Alfajores', sale: 700, cost: 450, tax: 21, qty: 18, branchQty: 30, min: 60 },
      { sku: 'KIO-GOL-001', name: 'Caramelos Arcor masticables x10', category: 'Golosinas', sale: 600, cost: 380, tax: 21, qty: 150, branchQty: 80, min: 50 },
      { sku: 'KIO-GOL-002', name: 'Chupetín Pico Dulce', category: 'Golosinas', sale: 450, cost: 280, tax: 21, qty: 300, branchQty: 150, min: 100 },
      { sku: 'KIO-GOL-003', name: 'Chicle Beldent menta x14', category: 'Golosinas', sale: 1500, cost: 950, tax: 21, qty: 90, branchQty: 45, min: 30 },
      { sku: 'KIO-GOL-004', name: 'Chocolate Águila 150g', category: 'Golosinas', sale: 3900, cost: 2600, tax: 21, qty: 40, min: 12 },
      { sku: 'KIO-GOL-005', name: 'Galletitas Oreo 118g', category: 'Golosinas', sale: 1600, cost: 1050, tax: 21, qty: 72, branchQty: 36, min: 24 },
      { sku: 'KIO-BEB-001', name: 'Coca-Cola 500ml', category: 'Bebidas', sale: 1900, cost: 1250, tax: 21, qty: 180, branchQty: 96, min: 48 },
      { sku: 'KIO-BEB-002', name: 'Coca-Cola 1.5L', category: 'Bebidas', sale: 3200, cost: 2100, tax: 21, qty: 60, branchQty: 36, min: 24 },
      { sku: 'KIO-BEB-003', name: 'Sprite 500ml', category: 'Bebidas', sale: 1800, cost: 1180, tax: 21, qty: 120, branchQty: 60, min: 36 },
      { sku: 'KIO-BEB-004', name: 'Agua Villavicencio 500ml', category: 'Bebidas', sale: 1200, cost: 750, tax: 10.5, qty: 200, branchQty: 100, min: 60 },
      { sku: 'KIO-BEB-005', name: 'Cerveza Quilmes lata 473ml', category: 'Bebidas', sale: 2200, cost: 1500, tax: 21, qty: 144, branchQty: 72, min: 48 },
      { sku: 'KIO-CIG-001', name: 'Marlboro Box 20', category: 'Cigarrillos', sale: 5500, cost: 4700, tax: 21, qty: 40, min: 20 },
      { sku: 'KIO-CIG-002', name: 'Philip Morris Box 20', category: 'Cigarrillos', sale: 4800, cost: 4100, tax: 21, qty: 8, branchQty: 20, min: 20 },
      { sku: 'KIO-SNA-001', name: 'Papas Lays 90g', category: 'Snacks', sale: 2100, cost: 1350, tax: 21, qty: 84, branchQty: 42, min: 30 },
      { sku: 'KIO-SNA-002', name: 'Maní tostado 100g', category: 'Snacks', sale: 1300, cost: 800, tax: 21, qty: 60, min: 20 },
      { sku: 'KIO-PAN-001', name: 'Medialuna de manteca', category: 'Panificados', sale: 900, cost: 400, tax: 10.5, qty: 50, branchQty: 30, min: 20 },
      { sku: 'KIO-PAN-002', name: 'Pan casero 500g', category: 'Panificados', sale: 1800, cost: 900, tax: 10.5, qty: 25, branchQty: 15, min: 10 },
      { sku: 'KIO-PAN-003', name: 'Facturas surtidas x6', category: 'Panificados', sale: 4200, cost: 2100, tax: 10.5, qty: 12, min: 6 },
    ],
    clients: [
      { name: 'Consumidor Final', type: 'Persona', taxId: '0' },
      { name: 'Cuenta mensual — Familia Gómez', type: 'Persona', phone: '11-5555-0101' },
      { name: 'Cuenta mensual — Taller Don Pedro', type: 'Empresa', phone: '11-5555-0102' },
      { name: 'Cuenta mensual — Peluquería Ale', type: 'Persona', phone: '11-5555-0103' },
      { name: 'Vecino revendedor — Maxi', type: 'Persona', phone: '11-5555-0104' },
      { name: 'Club Social Lanús', type: 'Empresa', email: 'cantina@clubsociallanus.com' },
    ],
    suppliers: [
      { name: 'Distribuidora Arcor Sur', taxId: '30-11111111-1', email: 'ventas@arcor-sur.com', phone: '11-5555-1001', contact: 'Jorge Medina' },
      { name: 'Mondelez Mayorista Oeste', taxId: '30-22222222-2', email: 'pedidos@mondelez-oeste.com', phone: '11-5555-1002', contact: 'Paula Ríos' },
      { name: 'Coca-Cola Andina — Distribuidor Lanús', taxId: '30-33333333-3', email: 'reparto@andina-lanus.com', phone: '11-5555-1003', contact: 'Diego Sosa' },
      { name: 'Massalin Particulares — Punto Lanús', taxId: '30-44444444-4', phone: '11-5555-1004', contact: 'Vendedor zona 7' },
      { name: 'Panificadora La Espiga', taxId: '27-55555555-5', phone: '11-5555-1005', contact: 'Marta (dueña)' },
    ],
    roles: [
      { name: 'Super Admin', description: 'Acceso total a la plataforma', perms: ALL },
      { name: 'Encargado', description: 'Gestiona stock, ventas y compras de su sucursal', perms: MANAGER_PERMS },
      { name: 'Cajero', description: 'Registra ventas en el punto de venta', perms: SALES_PERMS },
    ],
    users: [
      { firstName: 'Marta', lastName: 'Gómez', email: 'dueno@lodemarta.test', role: 'Super Admin', branch: null },
      { firstName: 'Rosa', lastName: 'Fernández', email: 'marta@lodemarta.test', role: 'Encargado', branch: 'central' },
      { firstName: 'Lucas', lastName: 'Torres', email: 'cajero@lodemarta.test', role: 'Cajero', branch: 'branch2' },
    ],
    ventaSkus: [
      { sku: 'KIO-BEB-001', qty: 6 },
      { sku: 'KIO-ALF-001', qty: 12 },
      { sku: 'KIO-CIG-001', qty: 2 },
    ],
    compraSkus: [
      { sku: 'KIO-BEB-001', qty: 48 },
      { sku: 'KIO-ALF-001', qty: 60 },
    ],
  },
  {
    slug: 'tecnosur',
    name: 'TecnoSur',
    legalName: 'TecnoSur SRL',
    taxId: '30-66666666-6',
    centralBranch: 'Casa Central',
    centralAddress: 'Av. Rivadavia 8900, Flores, CABA',
    branch2: 'Sucursal Shopping',
    branch2Address: 'Av. Cabildo 3200, Belgrano, CABA',
    categories: ['Notebooks', 'Celulares', 'Accesorios', 'Cables', 'Audio'],
    products: [
      { sku: 'TEC-NOT-001', name: 'Notebook Lenovo IdeaPad i5 16GB 512GB', category: 'Notebooks', sale: 1450000, cost: 1150000, tax: 21, qty: 12, branchQty: 5, min: 3 },
      { sku: 'TEC-NOT-002', name: 'Notebook HP Pavilion Ryzen 7 16GB 1TB', category: 'Notebooks', sale: 1890000, cost: 1520000, tax: 21, qty: 2, branchQty: 3, min: 4 },
      { sku: 'TEC-CEL-001', name: 'Celular Samsung A15 128GB', category: 'Celulares', sale: 420000, cost: 340000, tax: 21, qty: 25, branchQty: 12, min: 8 },
      { sku: 'TEC-CEL-002', name: 'Celular Motorola G85 256GB', category: 'Celulares', sale: 510000, cost: 410000, tax: 21, qty: 18, branchQty: 8, min: 6 },
      { sku: 'TEC-CEL-003', name: 'Celular iPhone 13 128GB', category: 'Celulares', sale: 1150000, cost: 950000, tax: 21, qty: 6, min: 2 },
      { sku: 'TEC-CEL-004', name: 'Tablet Samsung Tab A9 64GB', category: 'Celulares', sale: 380000, cost: 300000, tax: 21, qty: 10, branchQty: 4, min: 4 },
      { sku: 'TEC-AUD-001', name: 'Auriculares JBL Tune 510BT', category: 'Audio', sale: 95000, cost: 68000, tax: 21, qty: 30, branchQty: 15, min: 10 },
      { sku: 'TEC-AUD-002', name: 'Auriculares Haylou TWS in-ear', category: 'Audio', sale: 45000, cost: 30000, tax: 21, qty: 40, branchQty: 20, min: 15 },
      { sku: 'TEC-AUD-003', name: 'Parlante JBL Flip 6', category: 'Audio', sale: 280000, cost: 210000, tax: 21, qty: 3, branchQty: 6, min: 5 },
      { sku: 'TEC-ACC-001', name: 'Mouse Logitech M185 inalámbrico', category: 'Accesorios', sale: 28000, cost: 18000, tax: 21, qty: 60, branchQty: 30, min: 20 },
      { sku: 'TEC-ACC-002', name: 'Teclado Redragon Kumara RGB', category: 'Accesorios', sale: 75000, cost: 52000, tax: 21, qty: 22, branchQty: 10, min: 8 },
      { sku: 'TEC-ACC-003', name: 'Cargador rápido 25W USB-C', category: 'Accesorios', sale: 35000, cost: 22000, tax: 21, qty: 50, branchQty: 25, min: 15 },
      { sku: 'TEC-ACC-004', name: 'Power bank 10000mAh', category: 'Accesorios', sale: 65000, cost: 44000, tax: 21, qty: 28, branchQty: 12, min: 10 },
      { sku: 'TEC-ACC-005', name: 'Funda silicona universal', category: 'Accesorios', sale: 15000, cost: 7000, tax: 21, qty: 120, branchQty: 60, min: 40 },
      { sku: 'TEC-ACC-006', name: 'Smartwatch Amazfit GTS 4', category: 'Accesorios', sale: 220000, cost: 170000, tax: 21, qty: 8, branchQty: 4, min: 3 },
      { sku: 'TEC-CAB-001', name: 'Cable USB-C 1m reforzado', category: 'Cables', sale: 12000, cost: 6000, tax: 21, qty: 150, branchQty: 80, min: 50 },
      { sku: 'TEC-CAB-002', name: 'Cable HDMI 1.5m 4K', category: 'Cables', sale: 18000, cost: 9500, tax: 21, qty: 70, branchQty: 35, min: 25 },
      { sku: 'TEC-CAB-003', name: 'Disco SSD Kingston 480GB', category: 'Accesorios', sale: 85000, cost: 62000, tax: 21, qty: 20, min: 8 },
    ],
    clients: [
      { name: 'Consumidor Final', type: 'Persona', taxId: '0' },
      { name: 'Estudio Contable López & Asoc.', type: 'Empresa', taxId: '30-77777777-7', email: 'admin@lopezasoc.com' },
      { name: 'Colegio San Martín', type: 'Empresa', taxId: '30-88888888-8', email: 'compras@sanmartin.edu.ar' },
      { name: 'Inmobiliaria del Sur', type: 'Empresa', email: 'oficina@inmosur.com' },
      { name: 'Martín Aguirre', type: 'Persona', email: 'martin.aguirre@gmail.com', phone: '11-5555-0201' },
      { name: 'Sofía Benítez', type: 'Persona', email: 'sofi.benitez@gmail.com', phone: '11-5555-0202' },
      { name: 'Taller Gráfico Punto Color', type: 'Empresa', email: 'taller@puntocolor.com' },
    ],
    suppliers: [
      { name: 'Air Computers — Mayorista', taxId: '30-99999999-9', email: 'ventas@air-computers.com', phone: '11-5555-2001', contact: 'Alejandro Vidal' },
      { name: 'NewSan — Distribuidor oficial', taxId: '30-10101010-1', email: 'canal@newsan.com', phone: '11-5555-2002', contact: 'Carolina Paz' },
      { name: 'Stylus Importadora', taxId: '30-12121212-2', email: 'mayorista@stylus.com', phone: '11-5555-2003', contact: 'Ramiro Duke' },
      { name: 'Importadora Full Parts', taxId: '30-13131313-3', email: 'info@fullparts.com', phone: '11-5555-2004', contact: 'Nadia Ferro' },
    ],
    roles: [
      { name: 'Super Admin', description: 'Acceso total a la plataforma', perms: ALL },
      { name: 'Encargado', description: 'Gestiona stock, ventas y compras de su sucursal', perms: MANAGER_PERMS },
      { name: 'Vendedor', description: 'Registra ventas y consulta stock', perms: SALES_PERMS },
    ],
    users: [
      { firstName: 'Pablo', lastName: 'Sur', email: 'dueno@tecnosur.test', role: 'Super Admin', branch: null },
      { firstName: 'Daniela', lastName: 'Rojas', email: 'jefe@tecnosur.test', role: 'Encargado', branch: 'central' },
      { firstName: 'Iván', lastName: 'Castro', email: 'ventas@tecnosur.test', role: 'Vendedor', branch: 'branch2' },
    ],
    ventaSkus: [
      { sku: 'TEC-CEL-001', qty: 1 },
      { sku: 'TEC-AUD-001', qty: 2 },
      { sku: 'TEC-CAB-001', qty: 3 },
    ],
    compraSkus: [
      { sku: 'TEC-ACC-001', qty: 20 },
      { sku: 'TEC-CAB-001', qty: 50 },
    ],
  },
  {
    slug: 'el-tornillo',
    name: 'Ferretería El Tornillo',
    legalName: 'Ferretería El Tornillo SRL',
    taxId: '30-14141414-4',
    centralBranch: 'Casa Central',
    centralAddress: 'Av. Calchaquí 2500, Quilmes',
    branch2: 'Sucursal Ruta',
    branch2Address: 'Ruta 2 km 35, El Pato',
    categories: ['Herramientas', 'Tornillería', 'Pinturas', 'Electricidad'],
    products: [
      { sku: 'FER-HER-001', name: 'Martillo galponero 500g', category: 'Herramientas', sale: 18000, cost: 11500, tax: 21, qty: 40, branchQty: 20, min: 12 },
      { sku: 'FER-HER-002', name: 'Juego destornilladores x6', category: 'Herramientas', sale: 25000, cost: 16000, tax: 21, qty: 25, branchQty: 12, min: 8 },
      { sku: 'FER-HER-003', name: 'Taladro percutor 750W', category: 'Herramientas', sale: 120000, cost: 88000, tax: 21, qty: 8, branchQty: 4, min: 3 },
      { sku: 'FER-HER-004', name: 'Amoladora angular 115mm', category: 'Herramientas', sale: 95000, cost: 70000, tax: 21, qty: 2, branchQty: 4, min: 4 },
      { sku: 'FER-HER-005', name: 'Llave francesa 10"', category: 'Herramientas', sale: 32000, cost: 21000, tax: 21, qty: 18, branchQty: 9, min: 6 },
      { sku: 'FER-HER-006', name: 'Nivel de mano 40cm', category: 'Herramientas', sale: 20000, cost: 13000, tax: 21, qty: 15, min: 6 },
      { sku: 'FER-HER-007', name: 'Juego sierra copa bimetálica', category: 'Herramientas', sale: 28000, cost: 19000, tax: 21, qty: 10, min: 4 },
      { sku: 'FER-TOR-001', name: 'Tornillos autoperforantes x100', category: 'Tornillería', sale: 9500, cost: 6000, tax: 21, qty: 200, branchQty: 100, min: 60 },
      { sku: 'FER-TOR-002', name: 'Tarugos fisher 8mm x50', category: 'Tornillería', sale: 6000, cost: 3500, tax: 21, qty: 300, branchQty: 150, min: 100 },
      { sku: 'FER-TOR-003', name: 'Tuercas y arandelas surtidas x200', category: 'Tornillería', sale: 12000, cost: 7500, tax: 21, qty: 5, branchQty: 40, min: 30 },
      { sku: 'FER-PIN-001', name: 'Pintura látex interior 10L', category: 'Pinturas', sale: 85000, cost: 62000, tax: 21, qty: 20, branchQty: 10, min: 8 },
      { sku: 'FER-PIN-002', name: 'Esmalte sintético blanco 1L', category: 'Pinturas', sale: 22000, cost: 15000, tax: 21, qty: 35, branchQty: 18, min: 12 },
      { sku: 'FER-PIN-003', name: 'Set rodillo + pincel + bandeja', category: 'Pinturas', sale: 14000, cost: 8500, tax: 21, qty: 30, branchQty: 15, min: 10 },
      { sku: 'FER-PIN-004', name: 'Lijas pack surtido x10', category: 'Pinturas', sale: 5000, cost: 2800, tax: 21, qty: 80, branchQty: 40, min: 25 },
      { sku: 'FER-ELE-001', name: 'Cable unipolar 2.5mm rollo 100m', category: 'Electricidad', sale: 95000, cost: 72000, tax: 21, qty: 12, branchQty: 6, min: 5 },
      { sku: 'FER-ELE-002', name: 'Térmica bipolar 20A', category: 'Electricidad', sale: 18000, cost: 12500, tax: 21, qty: 40, branchQty: 20, min: 15 },
      { sku: 'FER-ELE-003', name: 'Lámparas LED 12W pack x4', category: 'Electricidad', sale: 16000, cost: 10000, tax: 21, qty: 50, branchQty: 25, min: 18 },
      { sku: 'FER-ELE-004', name: 'Cinta aisladora pack x3', category: 'Electricidad', sale: 6500, cost: 3800, tax: 21, qty: 90, branchQty: 45, min: 30 },
    ],
    clients: [
      { name: 'Consumidor Final', type: 'Persona', taxId: '0' },
      { name: 'Constructora Vial Sur', type: 'Empresa', taxId: '30-15151515-5', email: 'obras@vialsur.com' },
      { name: 'Electricista — Hugo Maidana', type: 'Persona', phone: '11-5555-0301' },
      { name: 'Pinturería y Obras Quilmes', type: 'Empresa', email: 'taller@oyq.com' },
      { name: 'Consorcio Edificio Las Flores', type: 'Empresa', email: 'admin@lasflores.com' },
      { name: 'Albañil — Ramón Duarte', type: 'Persona', phone: '11-5555-0302' },
    ],
    suppliers: [
      { name: 'Bulonera Gamar — Mayorista', taxId: '30-16161616-6', email: 'ventas@gamar.com', phone: '11-5555-3001', contact: 'Oscar Gamar' },
      { name: 'Tersuave — Distribuidor zona sur', taxId: '30-17171717-7', email: 'zona-sur@tersuave.com', phone: '11-5555-3002', contact: 'Liliana Prado' },
      { name: 'Electro Tucumán Materiales', taxId: '30-18181818-8', email: 'pedidos@electrotucuman.com', phone: '11-5555-3003', contact: 'Fabián Lescano' },
      { name: 'Herramientas Bremen directo', taxId: '30-19191919-9', email: 'mayorista@bremen.com', phone: '11-5555-3004', contact: 'Silvio Rey' },
    ],
    roles: [
      { name: 'Super Admin', description: 'Acceso total a la plataforma', perms: ALL },
      { name: 'Encargado', description: 'Gestiona stock, ventas y compras de su sucursal', perms: MANAGER_PERMS },
      { name: 'Vendedor', description: 'Atiende mostrador y registra ventas', perms: SALES_PERMS },
    ],
    users: [
      { firstName: 'Ernesto', lastName: 'Tornillo', email: 'dueno@eltornillo.test', role: 'Super Admin', branch: null },
      { firstName: 'Néstor', lastName: 'Capataz', email: 'capataz@eltornillo.test', role: 'Encargado', branch: 'central' },
      { firstName: 'Brian', lastName: 'Mostrador', email: 'mostrador@eltornillo.test', role: 'Vendedor', branch: 'branch2' },
    ],
    ventaSkus: [
      { sku: 'FER-PIN-001', qty: 2 },
      { sku: 'FER-TOR-001', qty: 5 },
      { sku: 'FER-ELE-003', qty: 3 },
    ],
    compraSkus: [
      { sku: 'FER-TOR-001', qty: 100 },
      { sku: 'FER-ELE-002', qty: 20 },
    ],
  },
];

const TAXES = [
  { name: 'IVA General 21%', rate: 21 },
  { name: 'IVA Reducido 10.5%', rate: 10.5 },
  { name: 'Exento 0%', rate: 0 },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------- helpers ---

async function ensurePermissions(): Promise<Map<string, number>> {
  await prisma.permission.createMany({ data: BASE_PERMISSIONS.map((name) => ({ name })), skipDuplicates: true });
  const rows = await prisma.permission.findMany({ where: { name: { in: BASE_PERMISSIONS } } });
  return new Map(rows.map((p) => [p.name, p.id]));
}

async function seedCompany(def: SeedCompany, permIds: Map<string, number>, hash: string) {
  const counts = { branches: 0, warehouses: 0, categories: 0, taxes: 0, products: 0, stocks: 0, clients: 0, suppliers: 0, roles: 0, users: 0, docs: 0 };

  let company = await prisma.company.findFirst({ where: { slug: def.slug } });
  if (!company) {
    company = await prisma.company.create({
      data: { name: def.name, slug: def.slug, legalName: def.legalName, taxId: def.taxId, currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires' },
    });
    console.log(`  + company: ${def.name}`);
  }
  const companyId = company.id;

  // Plans / subscription: reuse the free plan when the base seed already created it.
  let freePlan = await prisma.plan.findFirst({ where: { code: 'free' } });
  if (!freePlan) {
    freePlan = await prisma.plan.create({
      data: { code: 'free', name: 'Gratis', description: 'Plan demo', priceMonthly: 0, features: JSON.stringify(['demo']) },
    });
  }
  const sub = await prisma.companySubscription.findFirst({ where: { companyId } });
  if (!sub) {
    const now = new Date();
    await prisma.companySubscription.create({
      data: { companyId, planId: freePlan.id, status: 'active', currentPeriodStart: now, currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1) },
    });
  }

  // Roles (per company, global permission catalog reused — never duplicated).
  const roleIds = new Map<string, number>();
  for (const r of def.roles) {
    let role = await prisma.role.findFirst({ where: { companyId, name: r.name } });
    if (!role) {
      role = await prisma.role.create({ data: { companyId, name: r.name, description: r.description } });
      counts.roles++;
    }
    roleIds.set(r.name, role.id);
    await prisma.rolePermission.createMany({
      data: r.perms.map((p) => ({ roleId: role!.id, permissionId: permIds.get(p)! })).filter((d) => d.permissionId !== undefined),
      skipDuplicates: true,
    });
  }

  // Branches + warehouses (1 each).
  let central = await prisma.branch.findFirst({ where: { companyId, name: def.centralBranch } });
  if (!central) {
    central = await prisma.branch.create({ data: { companyId, name: def.centralBranch, address: def.centralAddress } });
    counts.branches++;
  }
  let branch2 = await prisma.branch.findFirst({ where: { companyId, name: def.branch2 } });
  if (!branch2) {
    branch2 = await prisma.branch.create({ data: { companyId, name: def.branch2, address: def.branch2Address } });
    counts.branches++;
  }
  let whCentral = await prisma.warehouse.findFirst({ where: { companyId, name: `Depósito ${def.centralBranch}` } });
  if (!whCentral) {
    whCentral = await prisma.warehouse.create({ data: { companyId, branchId: central.id, name: `Depósito ${def.centralBranch}` } });
    counts.warehouses++;
  }
  let whBranch2 = await prisma.warehouse.findFirst({ where: { companyId, name: `Depósito ${def.branch2}` } });
  if (!whBranch2) {
    whBranch2 = await prisma.warehouse.create({ data: { companyId, branchId: branch2.id, name: `Depósito ${def.branch2}` } });
    counts.warehouses++;
  }
  for (const b of [central, branch2]) {
    const cb = await prisma.cashBox.findFirst({ where: { branchId: b.id } });
    if (!cb) await prisma.cashBox.create({ data: { branchId: b.id, name: `Caja ${b.name}`, status: 'Abierta' } });
  }

  // Users (branch lock: null = owner/all-access).
  for (const u of def.users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      const branchId = u.branch === 'central' ? central.id : u.branch === 'branch2' ? branch2.id : null;
      const user = await prisma.user.create({
        data: { companyId, firstName: u.firstName, lastName: u.lastName, email: u.email, passwordHash: hash, status: 'Activo', branchId },
      });
      await prisma.userRole.create({ data: { userId: user.id, roleId: roleIds.get(u.role)! } });
      counts.users++;
    }
  }

  // Categories + company taxes.
  const catIds = new Map<string, number>();
  for (const name of def.categories) {
    let c = await prisma.category.findFirst({ where: { companyId, name } });
    if (!c) {
      c = await prisma.category.create({ data: { companyId, name } });
      counts.categories++;
    }
    catIds.set(name, c.id);
  }
  const taxIds = new Map<number, number>();
  for (const t of TAXES) {
    let tax = await prisma.tax.findFirst({ where: { companyId, rate: t.rate } });
    if (!tax) {
      tax = await prisma.tax.create({ data: { companyId, name: t.name, rate: t.rate } });
      counts.taxes++;
    }
    taxIds.set(Number(t.rate), tax.id);
  }

  // Products + stock.
  const productBySku = new Map<string, { id: number; sale: number; tax: number }>();
  for (const p of def.products) {
    let product = await prisma.product.findFirst({ where: { companyId, internalCode: p.sku } });
    if (!product) {
      product = await prisma.product.create({
        data: {
          companyId, internalCode: p.sku, name: p.name, salePrice: p.sale, costPrice: p.cost,
          categoryId: catIds.get(p.category), taxId: taxIds.get(p.tax)!, active: true,
        },
      });
      counts.products++;
    }
    productBySku.set(p.sku, { id: product.id, sale: Number(product.salePrice), tax: p.tax });
    const rows: { warehouseId: number; qty: number }[] = [{ warehouseId: whCentral.id, qty: p.qty }];
    if (p.branchQty !== undefined) rows.push({ warehouseId: whBranch2.id, qty: p.branchQty });
    for (const s of rows) {
      const exists = await prisma.stock.findFirst({ where: { productId: product.id, warehouseId: s.warehouseId } });
      if (!exists) {
        await prisma.stock.create({ data: { productId: product.id, warehouseId: s.warehouseId, quantity: s.qty, minStock: p.min } });
        counts.stocks++;
      }
    }
  }

  // Clients + suppliers.
  for (const c of def.clients) {
    const exists = await prisma.client.findFirst({ where: { companyId, name: c.name } });
    if (!exists) {
      await prisma.client.create({ data: { companyId, ...c } });
      counts.clients++;
    }
  }
  for (const s of def.suppliers) {
    const exists = await prisma.supplier.findFirst({ where: { companyId, name: s.name } });
    if (!exists) {
      await prisma.supplier.create({ data: { companyId, ...s } });
      counts.suppliers++;
    }
  }

  // Sample documents (only when the company has none — keeps numbering collision-free).
  const docCount = await prisma.document.count({ where: { companyId } });
  if (docCount === 0) {
    const owner = await prisma.user.findFirst({ where: { companyId, email: def.users[0].email } });
    const client = await prisma.client.findFirst({ where: { companyId, name: 'Consumidor Final' } });
    const supplier = await prisma.supplier.findFirst({ where: { companyId } });
    const cashBox = await prisma.cashBox.findFirst({ where: { branchId: central.id } });
    if (owner) {
      const buildTotals = (items: { qty: number; price: number; tax: number }[]) => {
        const subtotal = r2(items.reduce((a, i) => a + i.qty * i.price, 0));
        const totalTax = r2(items.reduce((a, i) => a + i.qty * i.price * (i.tax / 100), 0));
        return { subtotal, totalTax, total: r2(subtotal + totalTax) };
      };
      // VENTA (last 30 days) — priced from the product catalog.
      const vItems = def.ventaSkus.map((i) => {
        const p = productBySku.get(i.sku)!;
        return { productId: p.id, description: i.sku, qty: i.qty, price: p.sale, tax: p.tax };
      });
      const vT = buildTotals(vItems);
      const venta = await prisma.document.create({
        data: {
          companyId, type: DocumentType.VENTA, series: 'A', number: 1,
          date: new Date(Date.now() - 2 * 86400000),
          clientId: client?.id ?? null, userId: owner.id, branchId: central.id, warehouseId: whCentral.id,
          status: 'Pagado', ...vT, currency: 'ARS', exchangeRate: 1, notes: 'Venta demo (seed AR)',
        },
      });
      for (const i of vItems) {
        await prisma.documentItem.create({
          data: { documentId: venta.id, productId: i.productId, description: i.description, quantity: i.qty, unitPrice: i.price, taxRate: i.tax, lineTotal: r2(i.qty * i.price) },
        });
      }
      if (cashBox) {
        await prisma.payment.create({ data: { companyId, documentId: venta.id, cashBoxId: cashBox.id, amount: vT.total, method: 'Efectivo', status: 'Pagado' } });
      }
      counts.docs++;

      // COMPRA (last 30 days) — cost basis from the catalog.
      const cItems = def.compraSkus.map((i) => {
        const prod = def.products.find((p) => p.sku === i.sku)!;
        const p = productBySku.get(i.sku)!;
        return { productId: p.id, description: i.sku, qty: i.qty, price: prod.cost, tax: prod.tax };
      });
      const cT = buildTotals(cItems);
      const compra = await prisma.document.create({
        data: {
          companyId, type: DocumentType.COMPRA, series: 'A', number: 1,
          date: new Date(Date.now() - 5 * 86400000),
          supplierId: supplier?.id ?? null, userId: owner.id, branchId: central.id, warehouseId: whCentral.id,
          status: 'Pagado', ...cT, currency: 'ARS', exchangeRate: 1,
          externalNumber: '0001-00001001', notes: 'Compra demo a proveedor (seed AR)',
        },
      });
      for (const i of cItems) {
        await prisma.documentItem.create({
          data: { documentId: compra.id, productId: i.productId, description: i.description, quantity: i.qty, unitPrice: i.price, taxRate: i.tax, lineTotal: r2(i.qty * i.price) },
        });
      }
      if (cashBox) {
        await prisma.payment.create({ data: { companyId, documentId: compra.id, cashBoxId: cashBox.id, amount: cT.total, method: 'Transferencia', status: 'Pagado' } });
      }
      counts.docs++;
    }
  }

  return counts;
}

// ----------------------------------------------------------------- main ---

async function main() {
  console.log('Seeding AR demo companies (idempotent)...');
  const permIds = await ensurePermissions();
  const hash = await bcrypt.hash(PASSWORD, 10);
  const totals: Record<string, number> = {};
  for (const def of COMPANIES) {
    const c = await seedCompany(def, permIds, hash);
    console.log(`  ${def.slug}: +${c.products} products, +${c.stocks} stocks, +${c.clients} clients, +${c.suppliers} suppliers, +${c.users} users, +${c.docs} docs`);
    for (const [k, v] of Object.entries(c)) totals[k] = (totals[k] ?? 0) + v;
  }
  console.log(`TOTAL new rows: ${JSON.stringify(totals)} (second run should print all zeros)`);
  console.log('Seed AR complete.');
}

main()
  .catch((e) => {
    console.error('AR seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
