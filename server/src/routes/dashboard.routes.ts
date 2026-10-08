import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { tipoHechoEconomico } from '../lib/proyeccion.js';
import { requireAuth, requireAnyPermission, requireAssignedBranch, documentBranchWhere } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthLabel(d: Date): string {
  return `${d.toLocaleString('en', { month: 'long' })} ${d.getFullYear()}`;
}

/** GET /api/dashboard — real KPIs, recent activity and top products */
router.get(
  '/',
  requireAnyPermission(
    'ventas.leer',
    'compras.leer',
    'finanzas.leer',
    'reportes.leer',
  ),
  requireAssignedBranch,
  async (req, res) => {
    const companyId = req.authUser!.companyId;
    const start = monthStart(new Date());

    // F1.3: cada hecho económico se reconoce una sola vez. VENTA = ingreso,
    // COMPRA = egreso; la FACTURA se cuenta solo si su linaje no llega a un
    // hecho contable del mismo lado (una VENTA facturada no duplica; la venta
    // diferida PEDIDO → REMITO → FACTURA sí se reconoce). OC/PEDIDO/REMITO
    // nunca son hechos económicos.
    const docs = await prisma.document.findMany({
      where: documentBranchWhere(req),
      select: { id: true, type: true, date: true, total: true, clientId: true, supplierId: true, sourceDocumentId: true },
    });
    const ancestroDe = new Map(docs.map((doc) => [doc.id, { type: doc.type, sourceDocumentId: doc.sourceDocumentId }]));
    let totalSalesMonth = 0;
    let totalExpensesMonth = 0;
    for (const doc of docs) {
      if (doc.date < start) continue;
      const hecho = tipoHechoEconomico(doc, ancestroDe);
      if (hecho === 'ingreso') totalSalesMonth += Number(doc.total ?? 0);
      else if (hecho === 'egreso') totalExpensesMonth += Number(doc.total ?? 0);
    }

    const [pendingOrders, stocks, recent, ventas] = await Promise.all([
      prisma.document.count({
        where: { ...documentBranchWhere(req), type: 'OC', status: { not: 'Recibido' } },
      }),
      prisma.stock.findMany({
        where: {
          quantity: { lt: prisma.stock.fields.minStock },
          // Stock has no companyId: tenancy resolves through product/warehouse relations.
          product: { companyId },
          warehouse: { companyId, ...(!req.authUser!.isOwner ? { branchId: req.authUser!.branchId! } : {}) },
        },
        include: {
          product: { select: { id: true, name: true, internalCode: true } },
          warehouse: { select: { name: true } },
        },
        orderBy: { quantity: 'asc' },
        take: 8,
      }),
      prisma.document.findMany({
        where: documentBranchWhere(req),
        include: {
          client: { select: { name: true } },
          supplier: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
        take: 6,
      }),
      prisma.document.findMany({
        where: { ...documentBranchWhere(req), type: 'VENTA' },
        include: {
          items: {
            include: {
              product: { select: { name: true, internalCode: true } },
            },
          },
        },
      }),
    ]);

    // Top products by units sold across all VENTA documents.
    const byProduct = new Map<number, { name: string; sku: string; units: number }>();
    for (const doc of ventas) {
      for (const item of doc.items) {
        if (!item.productId) continue;
        const entry = byProduct.get(item.productId) ?? {
          name: item.product?.name ?? item.description,
          sku: item.product?.internalCode ?? '',
          units: 0,
        };
        entry.units += Number(item.quantity);
        byProduct.set(item.productId, entry);
      }
    }
    const topProducts = [...byProduct.values()].sort((a, b) => b.units - a.units).slice(0, 5);

    res.json({
      month: monthLabel(new Date()),
      totalSalesMonth,
      totalExpensesMonth,
      netCashFlow: totalSalesMonth - totalExpensesMonth,
      pendingOrders,
      lowStockCount: stocks.length,
      lowStockProducts: stocks.map((s) => ({
        productId: s.product.id,
        sku: s.product.internalCode ?? '',
        name: s.product.name,
        stock: Number(s.quantity),
        minStock: Number(s.minStock),
        warehouse: s.warehouse.name,
      })),
      recent: recent.map((d) => ({
        id: d.id,
        type: d.type,
        label: `${d.type} ${d.series}-${String(d.number).padStart(4, '0')}`,
        date: d.date,
        amount: Number(d.total),
        status: d.status,
        partyName: d.client?.name ?? d.supplier?.name ?? '',
      })),
      topProducts,
    });
  },
);

export default router;
