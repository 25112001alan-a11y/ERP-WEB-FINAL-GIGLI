import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  requireAuth,
  requirePermission,
  requireAnyPermission,
  tenantWhere,
} from '../middleware/auth.js';
import { parseBody } from '../lib/parseBody.js';
import { parsePositiveInt } from '../lib/params.js';

const router = Router();

router.use(requireAuth);

const salePointSchema = z.object({
  branchId: z.number().int().positive(),
  number: z.number().int().positive(),
  name: z.string().max(80).optional(),
});

const salePointPatchSchema = z
  .object({
    branchId: z.number().int().positive().optional(),
    number: z.number().int().positive().optional(),
    name: z.string().max(80).nullable().optional(),
  })
  .refine((v) => v.branchId !== undefined || v.number !== undefined || v.name !== undefined, {
    message: 'Nada para actualizar',
  });

const salePointSelect = {
  id: true,
  branchId: true,
  number: true,
  name: true,
  branch: { select: { id: true, name: true } },
} as const;

/**
 * GET /api/sale-points — tenant-scoped registry of fiscal points of sale.
 * Readable by any role that sees settings, purchases or sales: the same list
 * feeds the Configuración tab and the factura form.
 */
router.get('/', requireAnyPermission('configuracion.leer', 'compras.leer', 'ventas.leer'), async (req, res) => {
  const salePoints = await prisma.salePoint.findMany({
    where: tenantWhere(req),
    select: salePointSelect,
    orderBy: [{ branch: { name: 'asc' } }, { number: 'asc' }],
  });
  res.json(salePoints);
});

/**
 * POST /api/sale-points — register a new PV bound to a branch.
 * The number is unique per company so the FACTURA series derived from it never
 * collides inside the document numbering key (companyId, type, series, number).
 */
router.post('/', requirePermission('configuracion.escribir'), async (req, res) => {
  const body = parseBody(res, salePointSchema, req.body);
  if (!body) return;

  const branch = await prisma.branch.findFirst({
    where: { id: body.branchId, ...tenantWhere(req) },
    select: { id: true, companyId: true },
  });
  if (!branch) {
    res.status(400).json({ error: 'Sucursal no válida' });
    return;
  }

  const duplicate = await prisma.salePoint.findFirst({
    where: { companyId: branch.companyId, number: body.number },
    select: { id: true },
  });
  if (duplicate) {
    res.status(409).json({ error: 'Ya existe un punto de venta con ese número' });
    return;
  }

  const created = await prisma.salePoint.create({
    data: {
      companyId: branch.companyId,
      branchId: body.branchId,
      number: body.number,
      name: body.name,
    },
    select: salePointSelect,
  });
  res.status(201).json(created);
});

/**
 * PATCH /api/sale-points/:id — move the PV to another branch or rename it.
 */
router.patch('/:id', requirePermission('configuracion.escribir'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id == null) {
    res.status(400).json({ error: 'Punto de venta no válido' });
    return;
  }
  const body = parseBody(res, salePointPatchSchema, req.body);
  if (!body) return;

  const salePoint = await prisma.salePoint.findFirst({
    where: { id, ...tenantWhere(req) },
    select: { id: true, companyId: true, branchId: true, number: true },
  });
  if (!salePoint) {
    res.status(404).json({ error: 'Punto de venta no encontrado' });
    return;
  }

  const nextBranchId = body.branchId ?? salePoint.branchId;
  const nextNumber = body.number ?? salePoint.number;

  if (body.branchId !== undefined) {
    const branch = await prisma.branch.findFirst({
      where: { id: body.branchId, ...tenantWhere(req) },
      select: { id: true },
    });
    if (!branch) {
      res.status(400).json({ error: 'Sucursal no válida' });
      return;
    }
  }
  if (body.number !== undefined) {
    const duplicate = await prisma.salePoint.findFirst({
      where: { companyId: salePoint.companyId, number: body.number, id: { not: salePoint.id } },
      select: { id: true },
    });
    if (duplicate) {
      res.status(409).json({ error: 'Ya existe un punto de venta con ese número' });
      return;
    }
  }

  const updated = await prisma.salePoint.update({
    where: { id: salePoint.id },
    data: { branchId: nextBranchId, number: nextNumber, name: body.name === undefined ? undefined : body.name },
    select: salePointSelect,
  });
  res.json(updated);
});

/**
 * DELETE /api/sale-points/:id — remove a PV. Issued documents keep their frozen
 * number (InvoiceData.puntoVenta is a snapshot, not a FK), so a delete never
 * invalidates an already-registered factura.
 */
router.delete('/:id', requirePermission('configuracion.escribir'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id == null) {
    res.status(400).json({ error: 'Punto de venta no válido' });
    return;
  }
  const salePoint = await prisma.salePoint.findFirst({
    where: { id, ...tenantWhere(req) },
    select: { id: true },
  });
  if (!salePoint) {
    res.status(404).json({ error: 'Punto de venta no encontrado' });
    return;
  }
  await prisma.salePoint.delete({ where: { id: salePoint.id } });
  res.status(204).end();
});

export default router;