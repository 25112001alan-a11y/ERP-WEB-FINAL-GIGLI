import { PrismaClient, DocumentType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SEED_PRODUCTS, SEED_SUPPLIERS } from './seed-data.js';

const prisma = new PrismaClient();

// Production: set ADMIN_PASSWORD in the environment. Dev fallback keeps the demo password.
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'password123';
const COMPANY = {
  name: 'Nexus Enterprise Corp',
  legalName: 'Nexus Enterprise Corp SpA',
  taxId: '76.543.210-K',
  currency: 'USD',
  timezone: 'America/Santiago',
};

async function clean() {
  // Leaf-first deletion to respect FK constraints
  await prisma.documentItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.document.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.client.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.cashBox.deleteMany();
  await prisma.tax.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.company.deleteMany();
  console.log('  cleaned previous data');
}

async function main() {
  console.log('Seeding Nexus ERP...');
  await clean();

  const company = await prisma.company.create({ data: COMPANY });
  console.log(`  company: ${company.name} (id=${company.id})`);

  // ---------- Permissions ----------
  const permissionNames = [
    'inventario.leer', 'inventario.escribir',
    'ventas.leer', 'ventas.escribir',
    'compras.leer', 'compras.escribir',
    'finanzas.leer', 'finanzas.escribir',
    'reportes.leer',
    'configuracion.leer', 'configuracion.escribir',
    'usuarios.leer', 'usuarios.escribir',
    'auditoria.leer',
  ];
  const permissions: Record<string, number> = {};
  for (const name of permissionNames) {
    const p = await prisma.permission.create({ data: { name } });
    permissions[name] = p.id;
  }
  console.log(`  permissions: ${permissionNames.length}`);

  // ---------- Roles ----------
  const roleData = [
    { name: 'Super Admin', description: 'Acceso total a la plataforma', perms: permissionNames },
    { name: 'Gerente Ventas', description: 'Gestiona ventas, clientes y reportes', perms: ['ventas.leer', 'ventas.escribir', 'inventario.leer', 'reportes.leer', 'auditoria.leer'] },
    { name: 'Analista Inventario', description: 'Administra productos y stock', perms: ['inventario.leer', 'inventario.escribir', 'ventas.leer', 'reportes.leer'] },
    { name: 'Cajero POS', description: 'Registra ventas en el punto de venta', perms: ['ventas.leer', 'ventas.escribir', 'inventario.leer'] },
  ];
  const roles: Record<string, number> = {};
  for (const r of roleData) {
    const role = await prisma.role.create({
      data: { companyId: company.id, name: r.name, description: r.description },
    });
    await prisma.rolePermission.createMany({
      data: r.perms.map((perm) => ({ roleId: role.id, permissionId: permissions[perm] })),
    });
    roles[r.name] = role.id;
  }
  console.log(`  roles: ${roleData.length}`);

  // ---------- Users ----------
  const userData = [
    { firstName: 'Ana', lastName: 'Silva', email: 'ana.silva@empresa.com', role: 'Super Admin' },
    { firstName: 'Carlos', lastName: 'PÃ©rez', email: 'c.perez@empresa.com', role: 'Gerente Ventas' },
    { firstName: 'MarÃ­a', lastName: 'RodrÃ­guez', email: 'm.rodriguez@empresa.com', role: 'Analista Inventario' },
  ];
  const hash = await bcrypt.hash(PASSWORD, 10);
  const users: Record<string, number> = {};
  for (const u of userData) {
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        passwordHash: hash,
        status: 'Activo',
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: roles[u.role] } });
    users[`${u.firstName} ${u.lastName}`] = user.id;
  }
  console.log(`  users: ${userData.length} (password demo: "${PASSWORD}")`);

  // ---------- Structure ----------
  const branch = await prisma.branch.create({
    data: { companyId: company.id, name: 'Sucursal Principal', address: 'Av. Providencia 1234, Santiago' },
  });
  const warehouseCentral = await prisma.warehouse.create({
    data: { companyId: company.id, branchId: branch.id, name: 'DepÃ³sito Central' },
  });
  const warehouseNorth = await prisma.warehouse.create({
    data: { companyId: company.id, branchId: branch.id, name: 'Tienda Norte' },
  });
  const warehousesByName: Record<string, number> = {
    'DepÃ³sito Central': warehouseCentral.id,
    'Tienda Norte': warehouseNorth.id,
  };
  console.log('  structure: 1 branch, 2 warehouses');

  // ---------- Cash box ----------
  const cashBox = await prisma.cashBox.create({
    data: { branchId: branch.id, name: 'Caja Principal', status: 'Abierta' },
  });
  console.log('  cash box: Caja Principal');

  // ---------- Categories / Taxes ----------
  const categories: Record<string, number> = {};
  for (const name of ['ElectrÃ³nica', 'Muebles', 'Ropa', 'Bebidas', 'Snacks']) {
    const c = await prisma.category.create({ data: { companyId: company.id, name } });
    categories[name] = c.id;
  }
  const taxData = [
    { name: 'IVA ElectrÃ³nica 16%', rate: 16 },
    { name: 'IVA Reducido 12%', rate: 12 },
    { name: 'IVA General 19%', rate: 19 },
    { name: 'Exento 0%', rate: 0 },
  ];
  const taxesByRate: Record<number, number> = {};
  for (const t of taxData) {
    const tax = await prisma.tax.create({ data: t });
    taxesByRate[t.rate] = tax.id;
  }
  console.log(`  catalog base: ${Object.keys(categories).length} categories, ${taxData.length} taxes`);

  // ---------- Products / Stock (from front mock data) ----------
  const productIdsBySku: Record<string, number> = {};
  for (const p of SEED_PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        internalCode: p.sku,
        name: p.name,
        description: p.description,
        salePrice: p.price,
        costPrice: p.costPrice,
        categoryId: categories[p.category],
        taxId: taxesByRate[p.taxRate],
        active: p.active,
      },
    });
    productIdsBySku[p.sku] = product.id;
    await prisma.stock.create({
      data: {
        productId: product.id,
        warehouseId: warehousesByName[p.warehouse],
        quantity: p.stock,
        minStock: p.minStock,
      },
    });
  }
  console.log(`  products: ${SEED_PRODUCTS.length} with initial stock`);

  // ---------- Clients ----------
  const clientData = [
    { name: 'Acme Corporation Ltd.', type: 'B2B Wholesale', email: 'compras@acmecorp.com', taxId: 'A-76543210' },
    { name: 'Global Tech Industries', type: 'Retail Partner', email: 'compras@globaltech.com', taxId: 'B-11223344' },
    { name: 'Nexus Dynamics', type: 'Enterprise', email: 'adquisiciones@nexusdynamics.com', taxId: 'C-55667788' },
    { name: 'Smith & Co.', type: 'B2B Client', email: 'ops@smithco.com', taxId: 'D-99887766' },
    { name: 'Delta Logistics', type: 'Enterprise', email: 'supply@deltalog.com', taxId: 'E-33445566' },
    { name: 'Consumidor Final', type: 'Persona', taxId: '0' },
    { name: 'Carlos Aranda', type: 'B2C Retail', email: 'carlos.aranda@gmail.com' },
    { name: 'MarÃ­a LÃ³pez', type: 'B2B Wholesale', email: 'maria.lopez@gmail.com' },
  ];
  const clients: Record<string, number> = {};
  for (const c of clientData) {
    const client = await prisma.client.create({ data: { companyId: company.id, ...c } });
    clients[c.name] = client.id;
  }
  console.log(`  clients: ${clientData.length}`);

  // ---------- Suppliers ----------
  for (const s of SEED_SUPPLIERS) {
    await prisma.supplier.create({
      data: { companyId: company.id, name: s.name, taxId: s.taxId, email: s.email, phone: s.phone, contact: s.contactPerson },
    });
  }
  console.log(`  suppliers: ${SEED_SUPPLIERS.length}`);

  // ---------- Demo document: VENTA ----------
  const demoItems = [
    { sku: 'EL-LP-001', quantity: 2, unitPrice: 1299.0, taxRate: 16 },
    { sku: 'EL-KB-042', quantity: 3, unitPrice: 89.5, taxRate: 16 },
  ];
  const subtotal = demoItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);
  const totalTax = demoItems.reduce((acc, i) => acc + i.quantity * i.unitPrice * (i.taxRate / 100), 0);

  const demoDoc = await prisma.document.create({
    data: {
      companyId: company.id,
      type: DocumentType.VENTA,
      series: 'A',
      number: 1,
      date: new Date(),
      clientId: clients['Acme Corporation Ltd.'],
      userId: users['Ana Silva'],
      branchId: branch.id,
      warehouseId: warehouseCentral.id,
      status: 'Pagado',
      subtotal,
      totalTax,
      total: subtotal + totalTax,
      currency: 'USD',
      exchangeRate: 1,
      notes: 'Venta demo generada por el seed inicial',
    },
  });
  for (const i of demoItems) {
    await prisma.documentItem.create({
      data: {
        documentId: demoDoc.id,
        productId: productIdsBySku[i.sku],
        description: `Producto SKU ${i.sku}`,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxRate: i.taxRate,
        lineTotal: i.quantity * i.unitPrice,
      },
    });
  }
  await prisma.payment.create({
    data: {
      companyId: company.id,
      documentId: demoDoc.id,
      cashBoxId: cashBox.id,
      amount: subtotal + totalTax,
      method: 'Transferencia',
      status: 'Pagado',
    },
  });
  console.log(`  demo document: VENTA A-0001 (total ${subtotal + totalTax})`);

  // ---------- Audit logs ----------
  await prisma.auditLog.createMany({
    data: [
      { companyId: company.id, userId: users['Ana Silva'], action: 'Inicio de sesiÃ³n', module: 'Seguridad', details: 'Acceso exitoso desde Chrome/Windows', ip: '192.168.1.45' },
      { companyId: company.id, userId: users['Carlos PÃ©rez'], action: 'ModificaciÃ³n de Stock', module: 'Inventario', entity: 'Stock', entityId: productIdsBySku['EL-LP-001'], details: 'Ajuste de inventario en SKU: EL-LP-001 (+50 unidades)', ip: '192.168.1.22' },
      { companyId: company.id, userId: users['MarÃ­a RodrÃ­guez'], action: 'CreaciÃ³n de Factura', module: 'Ventas', entity: 'Document', entityId: demoDoc.id, details: `Factura generada #A-0001 por $${(subtotal + totalTax).toFixed(2)}`, ip: '192.168.1.15' },
    ],
  });
  console.log('  audit logs: 3');

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
