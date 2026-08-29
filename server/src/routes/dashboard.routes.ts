import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAnyPermission, tenantWhere } from '../middleware/auth.js';

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
  async (req, res) => {
    const companyId = req.authUser!.companyId;
    const start = monthStart(new Date());

    const [salesMonth, expensesMonth, pendingOrders, stocks, recent, ventas] = await Promise.all([
      prisma.document.aggregate({
        where: { companyId, type: 'VENTA', date: { gte: start } },
        _sum: { total: true },
      }),
      prisma.document.aggregate({
        where: { companyId, type: 'COMPRA', date: { gte: start } },
        _sum: { total: true },
      }),
      prisma.document.count({
        where: { companyId, type: 'OC', status: { not: 'Recibido' } },
      }),
      prisma.stock.findMany({
        where: { quantity: { lt: prisma.stock.fields.minStock } },
        include: {
          product: { select: { id: true, name: true, internalCode: true, companyId: true } },
          warehouse: { select: { name: true } },
        },
        orderBy: { quantity: 'asc' },
        take: 8,
      }),
      prisma.document.findMany({
        where: tenantWhere(req),
        include: {
          client: { select: { name: true } },
          supplier: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
        take: 6,
      }),
      prisma.document.findMany({
        where: { companyId, type: 'VENTA' },
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

    const totalSalesMonth = Number(salesMonth._sum.total ?? 0);
    const totalExpensesMonth = Number(expensesMonth._sum.total ?? 0);

    res.json({
      month: monthLabel(new Date()),
      totalSalesMonth,
      totalExpensesMonth,
      netCashFlow: totalSalesMonth - totalExpensesMonth,
      pendingOrders,
      lowStockCount: stocks.length,
      lowStockProducts: stocks
        .filter((s) => s.product.companyId === companyId)
        .map((s) => ({
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