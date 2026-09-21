import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';
import { logAudit, clientIp } from '../lib/audit.js';

const router = Router();

router.use(requireAuth);

/** GET /api/users/roles — roles available for this company (user picker) */
router.get('/roles', requirePermission('usuarios.leer'), async (req, res) => {
  const roles = await prisma.role.findMany({
    where: tenantWhere(req),
    select: { id: true, name: true, description: true },
    orderBy: { name: 'asc' },
  });
  res.json(roles);
});

/** GET /api/users — tenant-scoped users with roles and last access */
router.get('/', requirePermission('usuarios.leer'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: tenantWhere(req),
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      createdAt: true,
      lastAccess: true,
      branchId: true,
      branch: { select: { id: true, name: true } },
      roles: { select: { role: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json(
    users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
      status: u.status,
      createdAt: u.createdAt,
      lastAccess: u.lastAccess,
      branchId: u.branchId,
      branch: u.branch,
      roles: u.roles.map((ur) => ur.role.name),
    })),
  );
});

const createUserSchema = z.object({
  firstName: z.string().min(2).max(80),
  lastName: z.string().min(2).max(80),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
  roleId: z.number().int().positive(),
  // Branch lock: null = all-access (owner). Only a Super Admin may set it.
  branchId: z.number().int().positive().nullable().optional(),
});

/**
 * True when the caller holds the Super Admin role in their company.
 * Branch assignment is an ownership act, not a regular 'usuarios.escribir' one.
 */
async function callerIsSuperAdmin(companyId: number, userId: number): Promise<boolean> {
  const caller = await prisma.user.findUnique({
    where: { id: userId },
    select: { roles: { select: { role: { select: { name: true } } } } },
  });
  return caller?.roles.some((ur) => ur.role.name === 'Super Admin') ?? false;
}

async function resolveBranchOr400(companyId: number, branchId: number | null | undefined) {
  if (branchId === undefined || branchId === null) return null;
  const branch = await prisma.branch.findFirst({ where: { id: branchId, companyId } });
  return branch ?? 'invalid';
}

/** POST /api/users — creates a user inside the caller's company with a role */
router.post('/', requirePermission('usuarios.escribir'), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const companyId = req.authUser!.companyId;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    res.status(409).json({ error: 'El email ya está registrado' });
    return;
  }

  const role = await prisma.role.findFirst({
    where: { id: data.roleId, companyId },
  });
  if (!role) {
    res.status(400).json({ error: 'Rol no válido' });
    return;
  }

  // Only a Super Admin may lock a user to a branch.
  if (data.branchId !== undefined && data.branchId !== null) {
    if (!(await callerIsSuperAdmin(companyId, req.authUser!.userId))) {
      res.status(403).json({ error: 'Solo el Super Admin puede asignar sucursal' });
      return;
    }
  }
  const branch = await resolveBranchOr400(companyId, data.branchId);
  if (branch === 'invalid') {
    res.status(400).json({ error: 'Sucursal no válida para esta empresa' });
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        companyId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash,
        status: 'Activo',
        branchId: branch?.id ?? null,
        roles: { create: [{ roleId: role.id }] },
      },
      select: { id: true },
    });

    await logAudit(
      tx,
      companyId,
      req.authUser!.userId,
      {
        action: 'Creación de Usuario',
        module: 'Configuración',
        entity: 'User',
        entityId: user.id,
        details: `Usuario ${data.firstName} ${data.lastName} (${data.email}) creado con rol ${role.name}`,
      },
      clientIp(req),
    );

    return user;
  });

  res.status(201).json({
    id: result.id,
    name: `${data.firstName} ${data.lastName}`,
    email: data.email,
    role: role.name,
  });
});

const setBranchSchema = z.object({
  // null = unlock (all-access / owner behavior).
  branchId: z.number().int().positive().nullable(),
});

/** PATCH /api/users/:id/branch — lock/unlock a user to a branch (Super Admin only) */
router.patch('/:id/branch', requirePermission('usuarios.escribir'), async (req, res) => {
  const parsed = setBranchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const companyId = req.authUser!.companyId;
  if (!(await callerIsSuperAdmin(companyId, req.authUser!.userId))) {
    res.status(403).json({ error: 'Solo el Super Admin puede asignar sucursal' });
    return;
  }

  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    res.status(400).json({ error: 'Usuario no válido' });
    return;
  }
  const target = await prisma.user.findFirst({ where: { id: targetId, companyId } });
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }

  const branch = await resolveBranchOr400(companyId, parsed.data.branchId);
  if (branch === 'invalid') {
    res.status(400).json({ error: 'Sucursal no válida para esta empresa' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { branchId: branch?.id ?? null },
    select: { id: true, branchId: true },
  });

  await logAudit(
    prisma,
    companyId,
    req.authUser!.userId,
    {
      action: 'Asignación de Sucursal',
      module: 'Configuración',
      entity: 'User',
      entityId: targetId,
      details: `Sucursal de ${target.email} -> ${branch?.name ?? 'todas'}`,
    },
    clientIp(req),
  );

  res.json(updated);
});

export default router;