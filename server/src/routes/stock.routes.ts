import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('inventario.leer'));

const adjustSchema = z.object({
  productId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  delta: z.number().refine((v) => v !== 0, 'delta no puede ser 0'),
  reason: z.string().min(1).max(500),
});

/** GET /api/stock — stock per warehouse, tenant-scoped */
router.get('/', async (req, res) => {
  const { warehouseId } = req.query;
  const stocks = await prisma.stock.findMany({
    where: {
      ...(warehouseId ? { warehouseId: Number(warehouseId) } : {}),
      // Stock has no companyId: tenancy resolves through product/warehouse relations.
      product: { companyId: req.authUser!.companyId },
      warehouse: { companyId: req.authUser!.companyId },
    },
    include: {
      product: { select: { id: true, name: true, internalCode: true, salePrice: true } },
      warehouse: { select: { id: true, name: true } },
    },
    orderBy: [{ warehouse: { name: 'asc' } }, { product: { name: 'asc' } }],
  });
  res.json(stocks);
});

/**
 * POST /api/stock/adjust — manual stock adjustment.
 * Atomically updates the stock row and writes a StockMovement for traceability.
 */
router.post('/adjust', requirePermission('inventario.escribir'), async (req, res) => {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const { productId, warehouseId, delta, reason } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, ...tenantWhere(req) },
    });
    if (!product) {
      throw Object.assign(new Error('Producto no encontrado'), { status: 404 });
    }

    const warehouse = await tx.warehouse.findFirst({
      where: { id: warehouseId, ...tenantWhere(req) },
    });
    if (!warehouse) {
      throw Object.assign(new Error('Depósito no válido'), { status: 400 });
    }

    const stock = await tx.stock.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    if (!stock) {
      throw Object.assign(new Error('No existe stock para ese producto en el depósito'), {
        status: 404,
      });
    }

    const newQuantity = Number(stock.quantity) + delta;
    if (newQuantity < 0) {
      throw Object.assign(new Error('El ajuste dejaría stock negativo'), { status: 400 });
    }

    const updated = await tx.stock.update({
      where: { id: stock.id },
      data: { quantity: newQuantity },
    });

    await tx.stockMovement.create({
      data: {
        productId,
        warehouseFromId: delta < 0 ? warehouseId : null,
        warehouseToId: delta > 0 ? warehouseId : null,
        quantity: Math.abs(delta),
        type: 'AJUSTE',
        reason,
        userId: req.authUser!.userId,
      },
    });

    return { stock: updated, productName: product.name };
  });

  res.json({ ok: true, ...result });
});

export default router;
