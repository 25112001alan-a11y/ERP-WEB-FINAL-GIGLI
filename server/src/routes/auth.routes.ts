import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';

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
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

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

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    res.status(409).json({ error: 'El email ya está registrado' });
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const company = await prisma.company.create({
    data: { name: data.companyName, currency: data.currency },
  });

  // Permissions are a global catalog shared across companies (model has no companyId).
  await prisma.permission.createMany({
    data: BASE_PERMISSIONS.map((name) => ({ name })),
    skipDuplicates: true,
  });
  const permissions = await prisma.permission.findMany({
    where: { name: { in: BASE_PERMISSIONS } },
  });

  const superAdminRole = await prisma.role.create({
    data: {
      companyId: company.id,
      name: 'Super Admin',
      description: 'Acceso total a la plataforma',
      permissions: {
        create: permissions.map((p) => ({ permissionId: p.id })),
      },
    },
  });

  const user = await prisma.user.create({
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

  const token = signToken({ sub: user.id, companyId: user.companyId, email: user.email });

  res.status(201).json({
    token,
    user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email },
    company: { id: company.id, name: company.name, currency: company.currency },
  });
});

/**
 * POST /api/auth/login
 * Validates credentials and returns a JWT scoped to the user's company.
 */
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Credenciales inválidas' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Credenciales inválidas' });
    return;
  }

  if (user.status !== 'Activo') {
    res.status(403).json({ error: 'Usuario inactivo' });
    return;
  }

  const company = await prisma.company.findUnique({ where: { id: user.companyId } });

  // Touch last access for audit purposes.
  await prisma.user.update({ where: { id: user.id }, data: { lastAccess: new Date() } });

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
