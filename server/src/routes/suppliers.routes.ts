import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('compras.leer'));

const supplierSchema = z.object({
  name: z.string().min(1).max(150),
  taxId: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  contact: z.string().max(120).optional(),
});

const supplierUpdateSchema = supplierSchema.partial();

/** GET /api/suppliers — tenant-scoped list */
router.get('/', async (req, res) => {
  const { search } = req.query;
  const suppliers = await prisma.supplier.findMany({
    where: {
      ...tenantWhere(req),
      ...(typeof search === 'string' && search.trim()
        ? { OR: [{ name: { contains: search.trim() } }, { taxId: { contains: search.trim() } }] }
        : {}),
    },
    orderBy: { name: 'asc' },
  });
  res.json(suppliers);
});

/** GET /api/suppliers/:id */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const supplier = await prisma.supplier.findFirst({ where: { id, ...tenantWhere(req) } });
  if (!supplier) {
    res.status(404).json({ error: 'Proveedor no encontrado' });
    return;
  }
  res.json(supplier);
});

/** POST /api/suppliers */
router.post('/', requirePermission('compras.escribir'), async (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const supplier = await prisma.supplier.create({
    data: { ...tenantWhere(req), ...parsed.data },
  });
  res.status(201).json(supplier);
});

/** PATCH /api/suppliers/:id */
router.patch('/:id', requirePermission('compras.escribir'), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = supplierUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.supplier.findFirst({ where: { id, ...tenantWhere(req) } });
  if (!existing) {
    res.status(404).json({ error: 'Proveedor no encontrado' });
    return;
  }
  const supplier = await prisma.supplier.update({ where: { id }, data: parsed.data });
  res.json(supplier);
});

/** DELETE /api/suppliers/:id — only when no documents reference it */
router.delete('/:id', requirePermission('compras.escribir'), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.supplier.findFirst({ where: { id, ...tenantWhere(req) } });
  if (!existing) {
    res.status(404).json({ error: 'Proveedor no encontrado' });
    return;
  }
  const docCount = await prisma.document.count({ where: { supplierId: id } });
  if (docCount > 0) {
    res
      .status(409)
      .json({ error: 'No se puede eliminar: el proveedor tiene comprobantes asociados' });
    return;
  }
  await prisma.supplier.delete({ where: { id } });
  res.status(204).end();
});

export default router;
