import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { clientIp } from '../lib/audit.js';

const router = Router();

const BASE_PERMISSIONS = [
  'inventario.leer', 'inventario.escribir',
  'ventas.leer', 'ventas.escribir',
  'compras.leer', 'compras.escribir',
  'finanzas.leer', 'finanzas.escribir',
  'reportes.leer',
  'configuracion.leer', 'configuracion.escribir',
  'usuarios.leer', 'usuarios.escribir',
  'auditoria.leer',
];

const registerSchema = z.object({
  companyName: z.string().min(2, 'companyName es requerido').max(120),
  firstName: z.string().min(2, 'firstName es requerido').max(80),
  lastName: z.string().min(2, 'lastName es requerido').max(80),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
  currency: z.string().length(3).optional().default('USD'),
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

/**
 * POST /api/auth/register
 * Multi-tenant onboarding: creates a company, the Super Admin role with the
 * full base permission set, and the first user (company owner).
 */
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

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
        data: { name: data.companyName, currency: data.currency },
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
      company: { id: company.id, name: company.name, currency: company.currency },
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
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;
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
    company: company ? { id: company.id, name: company.name, currency: company.currency } : null,
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
      company: { select: { id: true, name: true, currency: true, timezone: true } },
      roles: {
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
    user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.name)),
  );

  res.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    status: user.status,
    lastAccess: user.lastAccess,
    company: user.company,
    roles: user.roles.map((ur) => ur.role.name),
    permissions: [...permissions],
  });
});

export default router;
