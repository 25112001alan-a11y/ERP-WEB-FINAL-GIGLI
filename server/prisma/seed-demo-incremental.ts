// Idempotent incremental demo-data seeder for EXISTING production databases.
// The regular seed.ts wipes the database (clean()), so it can never run against
// a production DB that already holds real data. This seeder:
//   - finds the first existing company and fills ONLY the missing demo records
//     (categories, taxes, products, stock, clients, suppliers, warehouses, cash box)
//   - creates the demo VENTA and the OC -> REMITO -> FACTURA chain ONLY when the
//     company has no documents at all (avoids colliding with real numbering).
// Safe to run repeatedly: every insert is guarded by a find-first check.

import { PrismaClient, DocumentType } from '@prisma/client';
import { SEED_PRODUCTS, SEED_SUPPLIERS } from './seed-data.js';

const prisma = new PrismaClient();

const CATEGORY_NAMES = ['Electrónica', 'Muebles', 'Ropa', 'Bebidas', 'Snacks'];
const TAX_DATA = [
  { name: 'IVA Electrónica 16%', rate: 16 },
  { name: 'IVA Reducido 12%', rate: 12 },
  { name: 'IVA General 19%', rate: 19 },
  { name: 'Exento 0%', rate: 0 },
];
const WAREHOUSE_NAMES = ['Depósito Central', 'Tienda Norte'];
const CLIENT_DATA = [
  { name: 'Acme Corporation Ltd.', type: 'B2B Wholesale', email: 'compras@acmecorp.com', taxId: 'A-76543210' },
  { name: 'Global Tech Industries', type: 'Retail Partner', email: 'compras@globaltech.com', taxId: 'B-11223344' },
  { name: 'Nexus Dynamics', type: 'Enterprise', email: 'adquisiciones@nexusdynamics.com', taxId: 'C-55667788' },
  { name: 'Smith & Co.', type: 'B2B Client', email: 'ops@smithco.com', taxId: 'D-99887766' },
  { name: 'Delta Logistics', type: 'Enterprise', email: 'supply@deltalog.com', taxId: 'E-33445566' },
  { name: 'Consumidor Final', type: 'Persona', taxId: '0' },
  { name: 'Carlos Aranda', type: 'B2C Retail', email: 'carlos.aranda@gmail.com' },
  { name: 'María López', type: 'B2B Wholesale', email: 'maria.lopez@gmail.com' },
];

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.log('  no company found — run the regular seed (prisma/seed.ts) first');
    return;
  }
  const { id: companyId } = company;
  console.log(`Incremental demo seed for company: ${company.name} (id=${companyId})`);

  // ---------- Branch / Warehouses / Cash box ----------
  let branch = await prisma.branch.findFirst({ where: { companyId } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: { companyId, name: 'Sucursal Principal', address: 'Av. Providencia 1234, Santiago' },
    });
    console.log('  + branch: Sucursal Principal');
  }
  const warehousesByName: Record<string, number> = {};
  for (const name of WAREHOUSE_NAMES) {
    let w = await prisma.warehouse.findFirst({ where: { companyId, name } });
    if (!w) {
      w = await prisma.warehouse.create({ data: { companyId, branchId: branch.id, name } });
      console.log(`  + warehouse: ${name}`);
    }
    warehousesByName[name] = w.id;
  }
  const existingCashBox = await prisma.cashBox.findFirst({ where: { branchId: branch.id } });
  if (!existingCashBox) {
    await prisma.cashBox.create({ data: { branchId: branch.id, name: 'Caja Principal', status: 'Abierta' } });
    console.log('  + cash box: Caja Principal');
  }

  // ---------- Categories ----------
  const categories: Record<string, number> = {};
  for (const name of CATEGORY_NAMES) {
    let c = await prisma.category.findFirst({ where: { companyId, name } });
    if (!c) {
      c = await prisma.category.create({ data: { companyId, name } });
      console.log(`  + category: ${name}`);
    }
    categories[name] = c.id;
  }

  // ---------- Taxes ----------
  const taxesByRate: Record<number, number> = {};
  for (const t of TAX_DATA) {
    let tax = await prisma.tax.findFirst({ where: { rate: t.rate } });
    if (!tax) {
      tax = await prisma.tax.create({ data: t });
      console.log(`  + tax: ${t.name}`);
    }
    taxesByRate[t.rate] = tax.id;
  }

  // ---------- Products / Stock ----------
  const productIdsBySku: Record<string, number> = {};
  for (const p of SEED_PRODUCTS) {
    let product = await prisma.product.findFirst({ where: { companyId, internalCode: p.sku } });
    if (!product) {
      product = await prisma.product.create({
        data: {
          companyId,
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
      console.log(`  + product: ${p.sku} (${p.name})`);
    }
    productIdsBySku[p.sku] = product.id;
    const warehouseId = warehousesByName[p.warehouse];
    const existingStock = await prisma.stock.findFirst({ where: { productId: product.id, warehouseId } });
    if (!existingStock) {
      await prisma.stock.create({
        data: { productId: product.id, warehouseId, quantity: p.stock, minStock: p.minStock },
      });
      console.log(`  + stock: ${p.sku} @ ${p.warehouse} = ${p.stock}`);
    }
  }

  // ---------- Clients ----------
  for (const c of CLIENT_DATA) {
    const exists = await prisma.client.findFirst({ where: { companyId, name: c.name } });
    if (!exists) {
      await prisma.client.create({ data: { companyId, ...c } });
      console.log(`  + client: ${c.name}`);
    }
  }

  // ---------- Suppliers ----------
  for (const s of SEED_SUPPLIERS) {
    const exists = await prisma.supplier.findFirst({ where: { companyId, taxId: s.taxId } });
    if (!exists) {
      await prisma.supplier.create({
        data: { companyId, name: s.name, taxId: s.taxId, email: s.email, phone: s.phone, contact: s.contactPerson },
      });
      console.log(`  + supplier: ${s.name}`);
    }
  }

  // ---------- Demo documents (only when company has none) ----------
  const docCount = await prisma.document.count({ where: { companyId } });
  if (docCount > 0) {
    console.log(`  documents: ${docCount} already exist — demo chain skipped`);
    return;
  }

  const user = await prisma.user.findFirst({ where: { companyId, email: 'ana.silva@empresa.com' } });
  if (!user) {
    console.log('  ana.silva@empresa.com not found — demo chain skipped');
    return;
  }
  const client = await prisma.client.findFirst({ where: { companyId, name: 'Acme Corporation Ltd.' } });
  const supplier = await prisma.supplier.findFirst({ where: { companyId } });
  const warehouseCentralId = warehousesByName['Depósito Central'];
  const cashBox = await prisma.cashBox.findFirst({ where: { branchId: branch.id } });
  const demoItems = [
    { sku: 'EL-LP-001', quantity: 2, unitPrice: 1299.0, taxRate: 16 },
    { sku: 'EL-KB-042', quantity: 3, unitPrice: 89.5, taxRate: 16 },
  ];
  const subtotal = demoItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);
  const totalTax = demoItems.reduce((acc, i) => acc + i.quantity * i.unitPrice * (i.taxRate / 100), 0);

  // VENTA demo
  const venta = await prisma.document.create({
    data: {
      companyId,
      type: DocumentType.VENTA,
      series: 'A',
      number: 1,
      date: new Date(),
      clientId: client?.id ?? null,
      userId: user.id,
      branchId: branch.id,
      warehouseId: warehouseCentralId,
      status: 'Pagado',
      subtotal,
      totalTax,
      total: subtotal + totalTax,
      currency: 'USD',
      exchangeRate: 1,
      notes: 'Venta demo generada por el seeder incremental',
    },
  });
  for (const i of demoItems) {
    await prisma.documentItem.create({
      data: {
        documentId: venta.id,
        productId: productIdsBySku[i.sku],
        description: `Producto SKU ${i.sku}`,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxRate: i.taxRate,
        lineTotal: i.quantity * i.unitPrice,
      },
    });
  }
  if (cashBox) {
    await prisma.payment.create({
      data: {
        companyId,
        documentId: venta.id,
        cashBoxId: cashBox.id,
        amount: subtotal + totalTax,
        method: 'Transferencia',
        status: 'Pagado',
      },
    });
  }
  console.log(`  + demo document: VENTA A-0001 (total ${(subtotal + totalTax).toFixed(2)})`);

  // OC -> REMITO -> FACTURA
  const ocItems = [
    { sku: 'EL-LP-001', quantity: 5, unitPrice: 850.0 },
    { sku: 'CL-TS-001', quantity: 3, unitPrice: 8.0 },
  ];
  const ocSubtotal = ocItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);
  const ocTotalTax = ocItems.reduce((acc, i) => acc + i.quantity * i.unitPrice * (16 / 100), 0);

  const oc = await prisma.document.create({
    data: {
      companyId,
      type: DocumentType.OC,
      series: 'A',
      number: 1,
      date: new Date(Date.now() - 7 * 86400000),
      supplierId: supplier?.id ?? null,
      userId: user.id,
      branchId: branch.id,
      status: 'Recibido',
      subtotal: ocSubtotal,
      totalTax: ocTotalTax,
      total: ocSubtotal + ocTotalTax,
      currency: 'USD',
      exchangeRate: 1,
      externalNumber: 'PRESUP-2026-071',
      notes: 'Presupuesto del proveedor registrado como referencia',
    },
  });
  for (const i of ocItems) {
    await prisma.documentItem.create({
      data: {
        documentId: oc.id,
        productId: productIdsBySku[i.sku],
        description: `Producto SKU ${i.sku}`,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxRate: 16,
        lineTotal: i.quantity * i.unitPrice,
      },
    });
  }

  const remito = await prisma.document.create({
    data: {
      companyId,
      type: DocumentType.REMITO,
      series: 'A',
      number: 1,
      date: new Date(Date.now() - 3 * 86400000),
      supplierId: supplier?.id ?? null,
      userId: user.id,
      branchId: branch.id,
      warehouseId: warehouseCentralId,
      sourceDocumentId: oc.id,
      externalNumber: 'R-000123',
      status: 'Recibido',
      subtotal: ocSubtotal,
      totalTax: ocTotalTax,
      total: ocSubtotal + ocTotalTax,
      currency: 'USD',
      exchangeRate: 1,
      notes: 'Remito de ingreso del proveedor (demo)',
    },
  });
  for (const i of ocItems) {
    await prisma.documentItem.create({
      data: {
        documentId: remito.id,
        productId: productIdsBySku[i.sku],
        description: `Producto SKU ${i.sku}`,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxRate: 16,
        lineTotal: i.quantity * i.unitPrice,
      },
    });
    const stockRow = await prisma.stock.findFirst({
      where: { productId: productIdsBySku[i.sku], warehouseId: warehouseCentralId },
    });
    if (stockRow) {
      await prisma.stock.update({
        where: { id: stockRow.id },
        data: { quantity: { increment: i.quantity } },
      });
    }
    await prisma.stockMovement.create({
      data: {
        productId: productIdsBySku[i.sku],
        warehouseToId: warehouseCentralId,
        quantity: i.quantity,
        type: 'ENTRADA',
        reason: 'REMITO A-0001 (recepción OC A-0001)',
        userId: user.id,
        documentId: remito.id,
      },
    });
  }

  const facturaCompra = await prisma.document.create({
    data: {
      companyId,
      type: DocumentType.FACTURA,
      series: 'A',
      number: 1,
      date: new Date(Date.now() - 2 * 86400000),
      supplierId: supplier?.id ?? null,
      userId: user.id,
      branchId: branch.id,
      sourceDocumentId: remito.id,
      externalNumber: '0004-00001234',
      status: 'Pagado',
      subtotal: ocSubtotal,
      totalTax: ocTotalTax,
      total: ocSubtotal + ocTotalTax,
      currency: 'USD',
      exchangeRate: 1,
      notes: 'Factura de compra del proveedor (demo)',
      invoiceData: {
        create: {
          invoiceType: 'A',
          cae: '70123456789654',
          caeDueDate: new Date(Date.now() + 10 * 86400000),
          puntoVenta: 4,
        },
      },
    },
  });
  for (const i of ocItems) {
    await prisma.documentItem.create({
      data: {
        documentId: facturaCompra.id,
        productId: productIdsBySku[i.sku],
        description: `Producto SKU ${i.sku}`,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxRate: 16,
        lineTotal: i.quantity * i.unitPrice,
      },
    });
  }
  if (cashBox) {
    await prisma.payment.create({
      data: {
        companyId,
        documentId: facturaCompra.id,
        cashBoxId: cashBox.id,
        amount: ocSubtotal + ocTotalTax,
        method: 'Transferencia',
        status: 'Pagado',
      },
    });
  }
  console.log(`  + demo chain: OC A-0001 -> REMITO A-0001 -> FACTURA A-0001 (total ${(ocSubtotal + ocTotalTax).toFixed(2)})`);

  console.log('Incremental demo seed complete.');
}

main()
  .catch((e) => {
    console.error('Incremental seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });