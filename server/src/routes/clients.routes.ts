import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';
import { parsePositiveInt, parsePagination, paginateResponse } from '../lib/params.js';
import { parseBody } from '../lib/parseBody.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('ventas.leer'));

const clientSchema = z.object({
  name: z.string().min(1).max(150),
  type: z.string().max(20).optional().default('Persona'),
  taxId: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  address: z.string().max(200).optional(),
  province: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  taxCondition: z.string().max(40).optional(),
});

const clientUpdateSchema = clientSchema.partial();

/** GET /api/clients — tenant-scoped list */
router.get('/', async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination !== null && 'error' in pagination) {
    res.status(400).json({ error: pagination.error });
    return;
  }
  const { search } = req.query;
  const clients = await prisma.client.findMany({
    where: {
      ...tenantWhere(req),
      ...(typeof search === 'string' && search.trim()
        ? { OR: [{ name: { contains: search.trim() } }, { taxId: { contains: search.trim() } }] }
        : {}),
    },
    orderBy: { name: 'asc' },
  });
  res.json(pagination ? paginateResponse(clients, pagination) : clients);
});

/** GET /api/clients/:id */
router.get('/:id', async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
  const client = await prisma.client.findFirst({ where: { id, ...tenantWhere(req) } });
  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }
  res.json(client);
});

/** POST /api/clients */
router.post('/', requirePermission('ventas.escribir'), async (req, res) => {
  const data = parseBody(res, clientSchema, req.body);
  if (!data) return;
  const client = await prisma.client.create({
    data: { ...tenantWhere(req), ...data },
  });
  res.status(201).json(client);
});

/** PATCH /api/clients/:id */
router.patch('/:id', requirePermission('ventas.escribir'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
  const data = parseBody(res, clientUpdateSchema, req.body);
  if (!data) return;
  const existing = await prisma.client.findFirst({ where: { id, ...tenantWhere(req) } });
  if (!existing) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }
  const client = await prisma.client.update({ where: { id }, data });
  res.json(client);
});

/** DELETE /api/clients/:id — only when no documents reference it */
router.delete('/:id', requirePermission('ventas.escribir'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
  const existing = await prisma.client.findFirst({ where: { id, ...tenantWhere(req) } });
  if (!existing) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }
  const docCount = await prisma.document.count({ where: { clientId: id } });
  if (docCount > 0) {
    res.status(409).json({ error: 'No se puede eliminar: el cliente tiene comprobantes asociados' });
    return;
  }
  await prisma.client.delete({ where: { id } });
  res.status(204).end();
});

export default router;
