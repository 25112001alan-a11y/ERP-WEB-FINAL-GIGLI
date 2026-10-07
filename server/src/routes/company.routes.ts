import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';
import { logAudit, clientIp } from '../lib/audit.js';
import { parseBody } from '../lib/parseBody.js';
import { slugify } from '../lib/slug.js';

const router = Router();

router.use(requireAuth);

/** GET /api/company — tenant profile */
router.get('/', requirePermission('configuracion.leer'), async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.authUser!.companyId },
    select: {
      id: true,
      name: true,
      slug: true,
      legalName: true,
      taxId: true,
      address: true,
      province: true,
      postalCode: true,
      taxCondition: true,
      currency: true,
      timezone: true,
    },
  });
  res.json(company);
});

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  slug: z.string().min(1).max(80).optional(),
  legalName: z.string().max(200).nullable().optional(),
  taxId: z.string().max(50).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  province: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  taxCondition: z.string().max(40).nullable().optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().max(50).nullable().optional(),
});

/** PATCH /api/company — updates the tenant profile (requires configuration.escribir) */
router.patch('/', requirePermission('configuracion.escribir'), async (req, res) => {
  const data = parseBody(res, patchSchema, req.body);
  if (!data) return;
  const companyId = req.authUser!.companyId;

  // The storefront slug is normalized and must stay unique across tenants.
  let nextSlug: string | undefined;
  if (data.slug !== undefined) {
    nextSlug = slugify(data.slug);
    const taken = await prisma.company.findUnique({
      where: { slug: nextSlug },
      select: { id: true },
    });
    if (taken && taken.id !== companyId) {
      res.status(409).json({
        error: `El slug "${nextSlug}" ya está en uso por otra empresa. Elegí otro identificador.`,
      });
      return;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const company = await tx.company.update({
      where: { id: companyId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
        ...(data.legalName !== undefined ? { legalName: data.legalName } : {}),
        ...(data.taxId !== undefined ? { taxId: data.taxId } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.province !== undefined ? { province: data.province } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
        ...(data.taxCondition !== undefined ? { taxCondition: data.taxCondition } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
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
    slug: updated.slug,
    legalName: updated.legalName,
    taxId: updated.taxId,
    address: updated.address,
    province: updated.province,
    postalCode: updated.postalCode,
    taxCondition: updated.taxCondition,
    currency: updated.currency,
    timezone: updated.timezone,
  });
});

export default router;