import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
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
const companyDetailSelect = { id: true, name: true, slug: true, legalName: true, currency: true, timezone: true, createdAt: true } as const;
const editCompanySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().min(1).max(200).nullable().optional(),
  timezone: z.string().trim().min(1).max(50).refine((value) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }).nullable().optional(),
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
  const [data, total] = await Promise.all([
    prisma.company.findMany({
      select: { id: true, name: true, slug: true, currency: true },
      orderBy: { id: 'asc' },
      skip,
      take: limit,
    }),
    prisma.company.count(),
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
    select: companyDetailSelect,
  });
  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' });
    return;
  }
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
    if ((error as { code?: string })?.code === 'P2025') {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }
    throw error;
  }
});

export default router;
