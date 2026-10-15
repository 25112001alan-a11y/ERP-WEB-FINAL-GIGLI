import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { signPlatformToken } from '../lib/jwt.js';
import { requirePlatformAuth } from '../middleware/auth.js';
import { PAGINATION_DEFAULT_LIMIT, parsePagination, parsePositiveInt } from '../lib/params.js';
import { generateUniqueSlug } from '../lib/slug.js';
import { parseBody } from '../lib/parseBody.js';
import { BASE_PERMISSIONS, registerSchema } from './auth.routes.js';

const router = Router();
const credentials = z.object({
  email: z.email().max(150),
  password: z.string().min(1).max(100),
});
const dummyHash = bcrypt.hashSync('platform-timing-equalizer', 10);
const createCompanySchema = registerSchema.omit({ password: true, _gotcha: true })
  .extend({ email: z.string().email('Email inválido').max(150) }).strict();
const companyDetailSelect = {
  id: true, name: true, slug: true, legalName: true, taxId: true, address: true,
  province: true, postalCode: true, taxCondition: true, currency: true, timezone: true,
  createdAt: true, updatedAt: true,
} as const;
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
const editCompanySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: optionalText(200),
  taxId: optionalText(50),
  address: optionalText(200),
  province: optionalText(100),
  postalCode: optionalText(20),
  taxCondition: optionalText(40),
  timezone: z.string().trim().min(1).max(50).refine((value) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }).nullable().optional(),
}).strict().refine((data) => Object.keys(data).length > 0);
const companyFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'past_due', 'canceled', 'pending']).optional(),
  plan: z.string().trim().max(30).optional(),
});
const subscriptionSelect = {
  status: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true,
  plan: { select: { code: true, name: true, priceMonthly: true } },
} as const;
const subscriptionPatchSchema = z.object({
  planCode: z.string().trim().min(1).max(30).optional(),
  status: z.enum(['active', 'past_due', 'canceled', 'pending']).optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0);

router.post('/login', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos' });
    return;
  }

  const user = await prisma.platformUser.findUnique({ where: { email: parsed.data.email } });
  const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? dummyHash);
  if (!user || !valid || user.status !== 'Activo') {
    res.status(401).json({ error: 'Credenciales inválidas' });
    return;
  }
  res.json({ token: signPlatformToken(user.id) });
});

router.get('/me', requirePlatformAuth, (req, res) => {
  res.json(req.platformUser);
});

router.post('/companies', requirePlatformAuth, async (req, res) => {
  const data = parseBody(res, createCompanySchema, req.body);
  if (!data) return;

  const invitationToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(invitationToken).digest('hex');
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: data.companyName, slug: await generateUniqueSlug(tx, data.companyName), currency: data.currency },
        select: { id: true, name: true, slug: true, currency: true },
      });
      await tx.permission.createMany({
        data: BASE_PERMISSIONS.map((name) => ({ name })),
        skipDuplicates: true,
      });
      const permissions = await tx.permission.findMany({ where: { name: { in: BASE_PERMISSIONS } } });
      const role = await tx.role.create({
        data: {
          companyId: company.id, name: 'Super Admin', description: 'Acceso total a la plataforma',
          permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
        },
      });
      const owner = await tx.user.create({
        data: {
          companyId: company.id, firstName: data.firstName, lastName: data.lastName,
          email: data.email, passwordHash, status: 'Pendiente',
          roles: { create: [{ roleId: role.id }] },
        },
        select: { id: true, firstName: true, lastName: true, email: true, status: true },
      });
      await tx.ownerInvitation.create({
        data: { companyId: company.id, userId: owner.id, platformUserId: req.platformUser!.id, tokenHash, expiresAt },
      });
      await tx.platformAuditEvent.create({
        data: { targetCompanyId: company.id, platformUserId: req.platformUser!.id, action: 'company.created' },
      });
      return { company, owner };
    });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ ...result, invitationToken });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      res.status(409).json({ error: 'El registro ya existe' });
      return;
    }
    throw error;
  }
});

router.get('/companies', requirePlatformAuth, async (req, res) => {
  const parsed = parsePagination(req.query);
  if (parsed && 'error' in parsed) {
    res.status(400).json(parsed);
    return;
  }
  const { page, limit } = parsed ?? { page: 1, limit: PAGINATION_DEFAULT_LIMIT };
  const skip = (page - 1) * limit;
  if (skip > 2147483647) {
    res.status(400).json({ error: 'Parámetros de paginación inválidos' });
    return;
  }
  const filters = companyFilterSchema.safeParse(req.query);
  if (!filters.success) {
    res.status(400).json({ error: 'Filtros inválidos' });
    return;
  }
  const { q, status, plan } = filters.data;
  const where: Prisma.CompanyWhereInput = {};
  if (q) where.OR = [{ name: { contains: q } }, { slug: { contains: q } }];
  if (status || plan) {
    where.subscription = {
      is: {
        ...(status ? { status } : {}),
        ...(plan ? { plan: { is: { code: plan } } } : {}),
      },
    };
  }
  const [data, total] = await Promise.all([
    prisma.company.findMany({
      where,
      select: { id: true, name: true, slug: true, currency: true },
      orderBy: { id: 'asc' },
      skip,
      take: limit,
    }),
    prisma.company.count({ where }),
  ]);
  res.json({ data, page, limit, total });
});

router.get('/companies/:id', requirePlatformAuth, async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null || id > 2147483647) {
    res.status(400).json({ error: 'ID de empresa inválido' });
    return;
  }
  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      ...companyDetailSelect,
      subscription: { select: subscriptionSelect },
    },
  });
  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' });
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.json(company);
});

router.patch('/companies/:id', requirePlatformAuth, async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null || id > 2147483647) {
    res.status(400).json({ error: 'ID de empresa inválido' });
    return;
  }
  const data = parseBody(res, editCompanySchema, req.body);
  if (!data) return;

  try {
    const company = await prisma.$transaction(async (tx) => {
      const existing = await tx.company.findUnique({ where: { id }, select: companyDetailSelect });
      if (!existing) return null;
      const changed = Object.fromEntries(
        Object.entries(data).filter(([key, value]) => value !== existing[key as keyof typeof data]),
      );
      if (Object.keys(changed).length === 0) return existing;
      const updated = await tx.company.update({ where: { id }, data: changed, select: companyDetailSelect });
      await tx.platformAuditEvent.create({
        data: { platformUserId: req.platformUser!.id, targetCompanyId: id, action: 'company.updated' },
      });
      return updated;
    });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }
    res.json(company);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'P2025') {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }
    if (code === 'P2002') {
      res.status(409).json({ error: 'El CUIT/ID fiscal ya está en uso por otra empresa' });
      return;
    }
    throw error;
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/platform/companies/:id/subscription — platform override
// ---------------------------------------------------------------------------
router.patch('/companies/:id/subscription', requirePlatformAuth, async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null || id > 2147483647) {
    res.status(400).json({ error: 'ID de empresa inválido' });
    return;
  }
  const data = parseBody(res, subscriptionPatchSchema, req.body);
  if (!data) return;

  let planId: number | undefined;
  if (data.planCode) {
    const plan = await prisma.plan.findUnique({ where: { code: data.planCode }, select: { id: true } });
    if (!plan) {
      res.status(400).json({ error: 'El plan indicado no existe' });
      return;
    }
    planId = plan.id;
  }

  const company = await prisma.company.findUnique({ where: { id }, select: { id: true } });
  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' });
    return;
  }

  const subscription = await prisma.$transaction(async (tx) => {
    const existing = await tx.companySubscription.findUnique({
      where: { companyId: id },
      select: { planId: true, status: true, cancelAtPeriodEnd: true },
    });

    if (!existing) {
      const free = await tx.plan.findUnique({ where: { code: 'free' }, select: { id: true } });
      const now = new Date();
      const created = await tx.companySubscription.create({
        data: {
          companyId: id,
          planId: planId ?? free!.id,
          status: data.status ?? 'active',
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        },
        select: subscriptionSelect,
      });
      await tx.platformAuditEvent.create({
        data: { platformUserId: req.platformUser!.id, targetCompanyId: id, action: 'subscription.created' },
      });
      return created;
    }

    const changes: { planId?: number; status?: string; cancelAtPeriodEnd?: boolean } = {};
    if (planId !== undefined && planId !== existing.planId) changes.planId = planId;
    if (data.status !== undefined && data.status !== existing.status) changes.status = data.status;
    if (data.cancelAtPeriodEnd !== undefined && data.cancelAtPeriodEnd !== existing.cancelAtPeriodEnd) {
      changes.cancelAtPeriodEnd = data.cancelAtPeriodEnd;
    }

    if (Object.keys(changes).length === 0) {
      return tx.companySubscription.findUnique({ where: { companyId: id }, select: subscriptionSelect });
    }

    const updated = await tx.companySubscription.update({
      where: { companyId: id },
      data: changes,
      select: subscriptionSelect,
    });
    await tx.platformAuditEvent.create({
      data: { platformUserId: req.platformUser!.id, targetCompanyId: id, action: 'subscription.updated' },
    });
    return updated;
  });

  res.set('Cache-Control', 'no-store');
  res.json(subscription);
});

// ---------------------------------------------------------------------------
// GET /api/platform/audit — global platform action feed (paginated)
// ---------------------------------------------------------------------------
router.get('/audit', requirePlatformAuth, async (req, res) => {
  const parsed = parsePagination(req.query);
  if (parsed && 'error' in parsed) {
    res.status(400).json(parsed);
    return;
  }
  const { page, limit } = parsed ?? { page: 1, limit: PAGINATION_DEFAULT_LIMIT };
  const skip = (page - 1) * limit;
  if (skip > 2147483647) {
    res.status(400).json({ error: 'Parámetros de paginación inválidos' });
    return;
  }
  const [data, total] = await Promise.all([
    prisma.platformAuditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true, action: true, createdAt: true,
        platformUser: { select: { email: true } },
        targetCompany: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.platformAuditEvent.count(),
  ]);
  res.set('Cache-Control', 'no-store');
  res.json({ data, page, limit, total });
});

// ---------------------------------------------------------------------------
// GET /api/platform/companies/:id/audit — platform actions on one company
// ---------------------------------------------------------------------------
router.get('/companies/:id/audit', requirePlatformAuth, async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null || id > 2147483647) {
    res.status(400).json({ error: 'ID de empresa inválido' });
    return;
  }
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true } });
  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' });
    return;
  }
  const events = await prisma.platformAuditEvent.findMany({
    where: { targetCompanyId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, action: true, createdAt: true, platformUser: { select: { email: true } } },
  });
  res.set('Cache-Control', 'no-store');
  res.json({ data: events });
});

export default router;
