import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';
import { logAudit, clientIp } from '../lib/audit.js';

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

/** GET /api/stock/warehouses — tenant-scoped warehouse catalog (for receipt/transfer pickers) */
router.get('/warehouses', async (_req, res) => {
  const warehouses = await prisma.warehouse.findMany({
    where: { companyId: _req.authUser!.companyId },
    orderBy: { name: 'asc' },
  });
  res.json(warehouses);
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

    await logAudit(
      tx,
      req.authUser!.companyId,
      req.authUser!.userId,
      {
        action: 'Ajuste de Stock',
        module: 'Inventario',
        entity: 'Product',
        entityId: product.id,
        details: `Ajuste de ${delta > 0 ? '+' : ''}${delta} en ${warehouse.name} (${product.name})`,
      },
      clientIp(req),
    );

    return { stock: updated, productName: product.name };
  });

  res.json({ ok: true, ...result });
});

const transferSchema = z.object({
  productId: z.number().int().positive(),
  fromWarehouseId: z.number().int().positive(),
  toWarehouseId: z.number().int().positive(),
  quantity: z.number().positive(),
  reason: z.string().max(500).optional(),
});

/**
 * POST /api/stock/transfer — moves stock between two warehouses of the same
 * company. Validates availability in the source, applies both stock rows
 * atomically and writes a TRANSFERENCIA movement with both sides.
 */
router.post('/transfer', requirePermission('inventario.escribir'), async (req, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const { productId, fromWarehouseId, toWarehouseId, quantity, reason } = parsed.data;

  if (fromWarehouseId === toWarehouseId) {
    res.status(400).json({ error: 'Los depósitos de origen y destino deben ser distintos' });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, ...tenantWhere(req) },
    });
    if (!product) {
      throw Object.assign(new Error('Producto no encontrado'), { status: 404 });
    }

    const fromWarehouse = await tx.warehouse.findFirst({
      where: { id: fromWarehouseId, ...tenantWhere(req) },
    });
    const toWarehouse = await tx.warehouse.findFirst({
      where: { id: toWarehouseId, ...tenantWhere(req) },
    });
    if (!fromWarehouse) {
      throw Object.assign(new Error('Depósito de origen no válido'), { status: 400 });
    }
    if (!toWarehouse) {
      throw Object.assign(new Error('Depósito de destino no válido'), { status: 400 });
    }

    const fromStock = await tx.stock.findUnique({
      where: { productId_warehouseId: { productId, warehouseId: fromWarehouseId } },
    });
    if (!fromStock) {
      throw Object.assign(new Error('No existe stock para ese producto en el depósito de origen'), {
        status: 404,
      });
    }
    const currentFrom = Number(fromStock.quantity);
    if (currentFrom < quantity) {
      throw Object.assign(
        new Error(`Stock insuficiente en origen (disponible: ${currentFrom})`),
        { status: 409 },
      );
    }

    await tx.stock.update({
      where: { id: fromStock.id },
      data: { quantity: { decrement: quantity } },
    });

    const toStock = await tx.stock.findUnique({
      where: { productId_warehouseId: { productId, warehouseId: toWarehouseId } },
    });
    if (toStock) {
      await tx.stock.update({
        where: { id: toStock.id },
        data: { quantity: { increment: quantity } },
      });
    } else {
      await tx.stock.create({
        data: {
          productId,
          warehouseId: toWarehouseId,
          quantity,
          minStock: 0,
        },
      });
    }

    await tx.stockMovement.create({
      data: {
        productId,
        warehouseFromId: fromWarehouseId,
        warehouseToId: toWarehouseId,
        quantity,
        type: 'TRANSFERENCIA',
        reason: reason ?? `${fromWarehouse.name} → ${toWarehouse.name}`,
        userId: req.authUser!.userId,
      },
    });

    await logAudit(
      tx,
      req.authUser!.companyId,
      req.authUser!.userId,
      {
        action: 'Transferencia de Stock',
        module: 'Inventario',
        entity: 'Product',
        entityId: product.id,
        details: `${quantity} × ${product.name}: ${fromWarehouse.name} → ${toWarehouse.name}`,
      },
      clientIp(req),
    );

    return { productName: product.name, quantity, fromWarehouse: fromWarehouse.name, toWarehouse: toWarehouse.name };
  });

  res.status(201).json({ ok: true, ...result });
});

export default router;
