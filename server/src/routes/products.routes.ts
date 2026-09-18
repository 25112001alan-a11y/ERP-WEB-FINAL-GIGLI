import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';
import { logAudit, clientIp } from '../lib/audit.js';
import { assertProductCreationAllowed } from '../lib/billing.js';

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

/** GET /api/products/taxes — system catalog (companyId null) + tenant's own taxes */
router.get('/taxes', async (req, res) => {
  const taxes = await prisma.tax.findMany({
    where: {
      OR: [{ companyId: null }, tenantWhere(req)],
    },
    orderBy: [{ active: 'desc' }, { rate: 'desc' }],
  });
  res.json(taxes);
});

const taxCreateSchema = z.object({ name: z.string().min(1).max(80), rate: z.number().nonnegative() });
const taxUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  rate: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});

/**
 * A product may use a global (system) tax or one owned by the tenant, never a
 * tax that belongs to another company.
 */
async function isValidTaxForTenant(
  req: Parameters<typeof tenantWhere>[0],
  taxId: number,
): Promise<boolean> {
  const tax = await prisma.tax.findFirst({
    where: { id: taxId, OR: [{ companyId: null }, tenantWhere(req)] },
    select: { id: true },
  });
  return Boolean(tax);
}

/** POST /api/products/taxes — create a tenant-owned tax rate */
router.post('/taxes', requirePermission('inventario.escribir'), async (req, res) => {
  const parsed = taxCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const tax = await prisma.tax.create({
    data: { ...parsed.data, companyId: req.authUser!.companyId },
  });
  res.status(201).json(tax);
});

/**
 * PATCH /api/products/taxes/:id — update a tenant-owned rate.
 * The shared system catalog (companyId null) is read-only for every tenant.
 */
router.patch('/taxes/:id', requirePermission('inventario.escribir'), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = taxUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.tax.findFirst({
    where: { id, ...tenantWhere(req) },
  });
  if (!existing) {
    const globalTax = await prisma.tax.findUnique({ where: { id }, select: { id: true } });
    if (globalTax) {
      res.status(403).json({ error: 'Los impuestos del sistema no se pueden modificar' });
      return;
    }
    res.status(404).json({ error: 'Impuesto no encontrado' });
    return;
  }
  const tax = await prisma.tax.update({ where: { id }, data: parsed.data });
  res.json(tax);
});

const categorySchema = z.object({
  name: z.string().min(1).max(80),
  parentId: z.number().int().positive().optional().nullable(),
});

/** POST /api/products/categories — create a tenant category */
router.post('/categories', requirePermission('inventario.escribir'), async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: parsed.data.parentId, ...tenantWhere(req) },
    });
    if (!parent) {
      res.status(400).json({ error: 'Categoría padre inválida' });
      return;
    }
  }
  const category = await prisma.category.create({
    data: { ...tenantWhere(req), name: parsed.data.name },
  });
  res.status(201).json(category);
});

/** PATCH /api/products/categories/:id — rename a tenant category */
router.patch('/categories/:id', requirePermission('inventario.escribir'), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ name: z.string().min(1).max(80) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.category.findFirst({ where: { id, ...tenantWhere(req) } });
  if (!existing) {
    res.status(404).json({ error: 'Categoría no encontrada' });
    return;
  }
  const category = await prisma.category.update({ where: { id }, data: { name: parsed.data.name } });
  res.json(category);
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
  // SaaS plan gate: the Free plan caps the product catalog size.
  try {
    await assertProductCreationAllowed(req.authUser!.companyId);
  } catch (err) {
    if ((err as { status?: number }).status === 402) {
      const e = err as { message: string; plan?: unknown };
      res.status(402).json({ error: e.message, plan: e.plan ?? null });
      return;
    }
    throw err;
  }

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

  if (!(await isValidTaxForTenant(req, data.taxId))) {
    res.status(400).json({ error: 'Impuesto inválido para esta empresa' });
    return;
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: { ...tenantWhere(req), ...data },
      include: { category: true, tax: true },
    });

    await logAudit(
      tx,
      req.authUser!.companyId,
      req.authUser!.userId,
      {
        action: 'Creación de Producto',
        module: 'Inventario',
        entity: 'Product',
        entityId: created.id,
        details: `Producto ${created.name} (${created.internalCode ?? 'sin código'}) creado`,
      },
      clientIp(req),
    );

    return created;
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

  if (parsed.data.taxId && !(await isValidTaxForTenant(req, parsed.data.taxId))) {
    res.status(400).json({ error: 'Impuesto inválido para esta empresa' });
    return;
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
