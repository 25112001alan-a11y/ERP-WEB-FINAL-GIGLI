import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('inventario.leer'));

/** GET /api/products/categories — tenant category catalog (before :id routes) */
router.get('/categories', async (req, res) => {
  const categories = await prisma.category.findMany({
    where: tenantWhere(req),
    orderBy: { name: 'asc' },
  });
  res.json(categories);
});

/** GET /api/products/taxes — global tax catalog */
router.get('/taxes', async (_req, res) => {
  const taxes = await prisma.tax.findMany({ where: { active: true }, orderBy: { rate: 'desc' } });
  res.json(taxes);
});

const productSchema = z.object({
  name: z.string().min(1).max(150),
  internalCode: z.string().min(1).max(50).optional(),
  barcode: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  salePrice: z.number().positive(),
  costPrice: z.number().nonnegative().optional().default(0),
  categoryId: z.number().int().positive().optional(),
  taxId: z.number().int().positive(),
  allowOversell: z.boolean().optional().default(false),
  active: z.boolean().optional().default(true),
});

const productUpdateSchema = productSchema.partial();

/** GET /api/products — list tenant products with stock summary */
router.get('/', async (req, res) => {
  const { search } = req.query;
  const products = await prisma.product.findMany({
    where: {
      ...tenantWhere(req),
      ...(typeof search === 'string' && search.trim()
        ? {
            OR: [
              { name: { contains: search.trim() } },
              { internalCode: { contains: search.trim() } },
              { barcode: { contains: search.trim() } },
            ],
          }
        : {}),
    },
    include: {
      category: { select: { name: true } },
      tax: { select: { name: true, rate: true } },
      stocks: { select: { warehouseId: true, quantity: true, minStock: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(products);
});

/** GET /api/products/:id — tenant-scoped product detail */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const product = await prisma.product.findFirst({
    where: { id, ...tenantWhere(req) },
    include: {
      category: { select: { name: true } },
      tax: { select: { name: true, rate: true } },
      stocks: { include: { warehouse: { select: { name: true } } } },
    },
  });
  if (!product) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }
  res.json(product);
});

/** POST /api/products — create product (validates category belongs to tenant) */
router.post('/', requirePermission('inventario.escribir'), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

  if (data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, ...tenantWhere(req) },
    });
    if (!category) {
      res.status(400).json({ error: 'Categoría inválida para esta empresa' });
      return;
    }
  }

  const product = await prisma.product.create({
    data: { ...tenantWhere(req), ...data },
    include: { category: true, tax: true },
  });
  res.status(201).json(product);
});

/** PATCH /api/products/:id — update product */
router.patch('/:id', requirePermission('inventario.escribir'), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.product.findFirst({ where: { id, ...tenantWhere(req) } });
  if (!existing) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }

  if (parsed.data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: parsed.data.categoryId, ...tenantWhere(req) },
    });
    if (!category) {
      res.status(400).json({ error: 'Categoría inválida para esta empresa' });
      return;
    }
  }

  const product = await prisma.product.update({
    where: { id },
    data: parsed.data,
    include: { category: true, tax: true },
  });
  res.json(product);
});

/** DELETE /api/products/:id — hard delete (only when no stock movement history) */
router.delete('/:id', requirePermission('inventario.escribir'), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.product.findFirst({ where: { id, ...tenantWhere(req) } });
  if (!existing) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }

  const movementCount = await prisma.stockMovement.count({ where: { productId: id } });
  if (movementCount > 0) {
    res.status(409).json({
      error: 'No se puede eliminar: el producto tiene movimientos históricos. Desactivelo en su lugar.',
    });
    return;
  }

  await prisma.product.delete({ where: { id } });
  res.status(204).end();
});

export default router;
