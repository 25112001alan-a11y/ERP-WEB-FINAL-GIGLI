import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';
import { parsePositiveInt, parsePagination, paginateResponse } from '../lib/params.js';
import { parseBody } from '../lib/parseBody.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('compras.leer'));

const supplierSchema = z.object({
  name: z.string().min(1).max(150),
  taxId: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  contact: z.string().max(120).optional(),
  address: z.string().max(200).nullable().optional(),
  province: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  taxCondition: z.string().max(40).nullable().optional(),
  iibb: z.string().max(80).nullable().optional(),
  paymentAlias: z.string().max(50).nullable().optional(),
  paymentTerms: z.string().max(80).nullable().optional(),
});

const supplierUpdateSchema = supplierSchema.partial();

/** GET /api/suppliers — tenant-scoped list */
router.get('/', async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination !== null && 'error' in pagination) {
    res.status(400).json({ error: pagination.error });
    return;
  }
  const { search } = req.query;
  const where = {
    ...tenantWhere(req),
    ...(typeof search === 'string' && search.trim()
      ? { OR: [{ name: { contains: search.trim() } }, { taxId: { contains: search.trim() } }] }
      : {}),
  };
  const take = pagination ? pagination.limit : undefined;
  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      ...(pagination ? { skip: (pagination.page - 1) * pagination.limit, take: pagination.limit } : {}),
    }),
    take ? prisma.supplier.count({ where }) : Promise.resolve(0),
  ]);
  res.json(pagination ? paginateResponse(suppliers, pagination, total) : suppliers);
});

/** GET /api/suppliers/:id */
router.get('/:id', async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
  const supplier = await prisma.supplier.findFirst({ where: { id, ...tenantWhere(req) } });
  if (!supplier) {
    res.status(404).json({ error: 'Proveedor no encontrado' });
    return;
  }
  res.json(supplier);
});

/** POST /api/suppliers */
router.post('/', requirePermission('compras.escribir'), async (req, res) => {
  const data = parseBody(res, supplierSchema, req.body);
  if (!data) return;
  const supplier = await prisma.supplier.create({
    data: { ...tenantWhere(req), ...data },
  });
  res.status(201).json(supplier);
});

/** PATCH /api/suppliers/:id */
router.patch('/:id', requirePermission('compras.escribir'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
  const data = parseBody(res, supplierUpdateSchema, req.body);
  if (!data) return;
  const existing = await prisma.supplier.findFirst({ where: { id, ...tenantWhere(req) } });
  if (!existing) {
    res.status(404).json({ error: 'Proveedor no encontrado' });
    return;
  }
  const supplier = await prisma.supplier.update({ where: { id }, data });
  res.json(supplier);
});

/** DELETE /api/suppliers/:id — only when no documents reference it */
router.delete('/:id', requirePermission('compras.escribir'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
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
