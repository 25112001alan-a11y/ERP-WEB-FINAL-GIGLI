import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';
import { logAudit, clientIp } from '../lib/audit.js';

const router = Router();

router.use(requireAuth);

/** GET /api/company — tenant profile */
router.get('/', requirePermission('configuracion.leer'), async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.authUser!.companyId },
    select: {
      id: true,
      name: true,
      legalName: true,
      taxId: true,
      currency: true,
      timezone: true,
    },
  });
  res.json(company);
});

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  legalName: z.string().max(200).nullable().optional(),
  taxId: z.string().max(50).nullable().optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().max(50).nullable().optional(),
});

/** PATCH /api/company — updates the tenant profile (requires configuration.escribir) */
router.patch('/', requirePermission('configuracion.escribir'), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const companyId = req.authUser!.companyId;

  const updated = await prisma.$transaction(async (tx) => {
    const company = await tx.company.update({
      where: { id: companyId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.legalName !== undefined ? { legalName: parsed.data.legalName } : {}),
        ...(parsed.data.taxId !== undefined ? { taxId: parsed.data.taxId } : {}),
        ...(parsed.data.currency !== undefined ? { currency: parsed.data.currency } : {}),
        ...(parsed.data.timezone !== undefined ? { timezone: parsed.data.timezone } : {}),
      },
    });

    await logAudit(
      tx,
      companyId,
      req.authUser!.userId,
      { action: 'Actualización de Empresa', module: 'Configuración', entity: 'Company', entityId: company.id },
      clientIp(req),
    );

    return company;
  });

  res.json({
    id: updated.id,
    name: updated.name,
    legalName: updated.legalName,
    taxId: updated.taxId,
    currency: updated.currency,
    timezone: updated.timezone,
  });
});

export default router;