import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth, PLATFORM_ONLY_PERMISSIONS } from '../middleware/auth.js';
import { generateUniqueSlug } from '../lib/slug.js';
import { parseBody } from '../lib/parseBody.js';
import { clientIp } from '../lib/audit.js';

const router = Router();

// Global permission catalog shared across companies.
export const BASE_PERMISSIONS = [
  'inventario.leer', 'inventario.escribir',
  'ventas.leer', 'ventas.escribir',
  'compras.leer', 'compras.escribir',
  'finanzas.leer', 'finanzas.escribir',
  'reportes.leer',
  'configuracion.leer', 'configuracion.escribir',
  'usuarios.leer', 'usuarios.escribir',
  'auditoria.leer',
  'billing.leer',
];

// Company owners keep billing.leer for their own subscription UX; legacy
// billing.manage is excluded and never authorizes platform endpoints.

export const registerSchema = z.object({
  companyName: z.string().min(2, 'companyName es requerido').max(120),
  firstName: z.string().min(2, 'firstName es requerido').max(80),
  lastName: z.string().min(2, 'lastName es requerido').max(80),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
  currency: z.string().length(3).optional().default('ARS'),
  // Honeypot: hidden in the form, so only automated submissions fill it.
  _gotcha: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

// Brute-force policy: N consecutive failures lock the account for M minutes.
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Compared against when the email does not exist, so the response time does not
// reveal whether an account is registered.
const DUMMY_HASH = bcrypt.hashSync('nexus-erp-timing-equalizer', 10);
const activationSchema = z.object({
  token: z.string().regex(/^[a-fA-F0-9]{64}$/),
  password: registerSchema.shape.password,
}).strict();
const invalidInvitation = new Error('Invalid owner invitation');

/** POST /api/auth/activate-owner — consume one invitation without issuing a JWT. */
router.post('/activate-owner', async (req, res) => {
  const parsed = activationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invitación inválida' });
    return;
  }

  const tokenHash = createHash('sha256').update(parsed.data.token.toLowerCase()).digest('hex');
  const invitation = await prisma.ownerInvitation.findUnique({
    where: { tokenHash },
    select: {
      id: true, companyId: true, userId: true, consumedAt: true, expiresAt: true,
      user: { select: { companyId: true } },
    },
  });
  if (!invitation || invitation.consumedAt || invitation.expiresAt <= new Date() ||
      invitation.user.companyId !== invitation.companyId) {
    res.status(400).json({ error: 'Invitación inválida' });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.ownerInvitation.updateMany({
        where: { id: invitation.id, tokenHash, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) throw invalidInvitation;

      const activated = await tx.user.updateMany({
        where: { id: invitation.userId, companyId: invitation.companyId, status: 'Pendiente' },
        data: { passwordHash, status: 'Activo' },
      });
      if (activated.count !== 1) throw invalidInvitation;
    });
  } catch (error) {
    if (error !== invalidInvitation) throw error;
    res.status(400).json({ error: 'Invitación inválida' });
    return;
  }

  res.json({ ok: true });
});

/**
 * POST /api/auth/register
 * Multi-tenant onboarding: creates a company, the Super Admin role with the
 * owner permission set (full base set minus platform-only permissions),
 * and the first user (company owner).
 */
router.post('/register', async (req, res) => {
  const data = parseBody(res, registerSchema, req.body);
  if (!data) return;

  // Honeypot: pretend success so the bot cannot learn that it was detected,
  // but create nothing.
  if (data._gotcha && data._gotcha.trim() !== '') {
    res.status(201).json({ ok: true });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    res.status(409).json({ error: 'El email ya está registrado' });
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  // Onboarding is all-or-nothing: a half-created company (no role/user) would be
  // an unreachable tenant, so everything commits together.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: data.companyName, slug: await generateUniqueSlug(tx, data.companyName), currency: data.currency },
      });

      // Permissions are a global catalog shared across companies (model has no companyId).
      await tx.permission.createMany({
        data: BASE_PERMISSIONS.map((name) => ({ name })),
        skipDuplicates: true,
      });
      const permissions = await tx.permission.findMany({
        where: { name: { in: BASE_PERMISSIONS } },
      });

      const superAdminRole = await tx.role.create({
        data: {
          companyId: company.id,
          name: 'Super Admin',
          description: 'Acceso total a la plataforma',
          permissions: {
            create: permissions.map((p) => ({ permissionId: p.id })),
          },
        },
      });

      const user = await tx.user.create({
        data: {
          companyId: company.id,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          passwordHash,
          status: 'Activo',
          roles: { create: [{ roleId: superAdminRole.id }] },
        },
      });

      return { company, user };
    });

    const { company, user } = result;
    const token = signToken({ sub: user.id, companyId: user.companyId, email: user.email });

    res.status(201).json({
      token,
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email },
      company: { id: company.id, name: company.name, slug: company.slug, currency: company.currency },
    });
  } catch (error) {
    // Two concurrent registrations for the same email: the unique index wins.
    if ((error as { code?: string })?.code === 'P2002') {
      res.status(409).json({ error: 'El email ya está registrado' });
      return;
    }
    throw error;
  }
});

/**
 * POST /api/auth/login
 * Validates credentials and returns a JWT scoped to the user's company.
 * Repeated failures lock the account temporarily.
 */
router.post('/login', async (req, res) => {
  const body = parseBody(res, loginSchema, req.body);
  if (!body) return;
  const { email, password } = body;
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Same cost as a real comparison, so timing does not disclose the account.
    await bcrypt.compare(password, DUMMY_HASH);
    res.status(401).json({ error: 'Credenciales inválidas' });
    return;
  }

  // An expired lock behaves as if the counter had been reset.
  const lockExpired = user.lockedUntil !== null && user.lockedUntil <= now;
  if (user.lockedUntil && !lockExpired) {
    const minutesLeft = Math.max(1, Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000));
    res.status(429).json({
      error: `Cuenta bloqueada temporalmente por intentos fallidos. Reintentá en ${minutesLeft} minuto(s).`,
    });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = (lockExpired ? 0 : user.failedAttempts) + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
      },
    });

    if (shouldLock) {
      await prisma.auditLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          action: 'Bloqueo de cuenta',
          module: 'Seguridad',
          details: `Cuenta bloqueada ${LOCK_MINUTES} min tras ${MAX_FAILED_ATTEMPTS} intentos fallidos`,
          ip: clientIp(req),
        },
      });
      res.status(429).json({
        error: `Cuenta bloqueada temporalmente por intentos fallidos. Reintentá en ${LOCK_MINUTES} minuto(s).`,
      });
      return;
    }

    res.status(401).json({ error: 'Credenciales inválidas' });
    return;
  }

  if (user.status !== 'Activo') {
    res.status(403).json({ error: 'Usuario inactivo' });
    return;
  }

  const company = await prisma.company.findUnique({ where: { id: user.companyId } });

  // Successful login clears the failure counter.
  await prisma.user.update({
    where: { id: user.id },
    data: { lastAccess: now, failedAttempts: 0, lockedUntil: null },
  });

  // Audit trail: successful login.
  await prisma.auditLog.create({
    data: {
      companyId: user.companyId,
      userId: user.id,
      action: 'Inicio de sesión',
      module: 'Seguridad',
      details: `Acceso exitoso (${email})`,
      ip: clientIp(req),
    },
  });

  const token = signToken({ sub: user.id, companyId: user.companyId, email: user.email });

  res.json({
    token,
    user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email },
    company: company ? { id: company.id, name: company.name, slug: company.slug, currency: company.currency } : null,
  });
});

/**
 * GET /api/auth/me
 * Returns the current user with roles and resolved permissions (RBAC).
 */
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.authUser!.userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      lastAccess: true,
      branchId: true,
      company: { select: { id: true, name: true, slug: true, currency: true, timezone: true } },
      roles: {
        where: { role: { companyId: req.authUser!.companyId } },
        select: {
          role: {
            select: {
              id: true,
              name: true,
              permissions: { select: { permission: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }

  const permissions = new Set(
    user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.name))
      .filter((name) => !PLATFORM_ONLY_PERMISSIONS.includes(name)),
  );
  const roleNames = user.roles.map((ur) => ur.role.name);
  const isOwner = req.authUser!.isOwner;

  // Owner/all-access users get the company branch list so they can switch;
  // locked users only see their assigned branch.
  const allowedBranches = isOwner
    ? await prisma.branch.findMany({
        where: { companyId: user.company.id },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : await prisma.branch.findMany({
        where: { companyId: user.company.id, id: user.branchId ?? -1 },
        select: { id: true, name: true },
      });

  res.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    status: user.status,
    lastAccess: user.lastAccess,
    branchId: user.branchId,
    isOwner,
    allowedBranches,
    company: user.company,
    roles: roleNames,
    permissions: [...permissions],
  });
});

export default router;
