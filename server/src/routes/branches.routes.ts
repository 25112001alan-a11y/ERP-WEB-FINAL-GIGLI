import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';
import { parseBody } from '../lib/parseBody.js';
import { parsePositiveInt } from '../lib/params.js';

const router = Router();

router.use(requireAuth);

const branchDefaultSchema = z.object({
  defaultWarehouseId: z.number().int().positive().nullable(),
});

/**
 * PATCH /api/branches/:id — set (or clear) the default receiving warehouse of
 * a branch. Receipt and dispatch flows prefill this warehouse while still
 * letting the operator override it per document.
 */
router.patch('/:id', requirePermission('configuracion.escribir'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id == null) {
    res.status(400).json({ error: 'Sucursal no válida' });
    return;
  }
  const body = parseBody(res, branchDefaultSchema, req.body);
  if (!body) return;

  const branch = await prisma.branch.findFirst({
    where: { id, ...tenantWhere(req) },
    select: { id: true, companyId: true },
  });
  if (!branch) {
    res.status(404).json({ error: 'Sucursal no encontrada' });
    return;
  }

  if (body.defaultWarehouseId != null) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: body.defaultWarehouseId, companyId: branch.companyId },
      select: { id: true, branchId: true },
    });
    if (!warehouse) {
      res.status(400).json({ error: 'Depósito no válido' });
      return;
    }
    if (warehouse.branchId !== branch.id) {
      res.status(400).json({ error: 'El depósito debe pertenecer a la sucursal' });
      return;
    }
  }

  const updated = await prisma.branch.update({
    where: { id: branch.id },
    data: { defaultWarehouseId: body.defaultWarehouseId },
    select: { id: true, name: true, defaultWarehouseId: true },
  });
  res.json(updated);
});

export default router;