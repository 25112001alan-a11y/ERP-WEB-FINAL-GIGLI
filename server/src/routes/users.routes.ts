import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere, getUserPermissions, PLATFORM_ONLY_PERMISSIONS } from '../middleware/auth.js';
import { logAudit, clientIp } from '../lib/audit.js';
import { parseBody } from '../lib/parseBody.js';
import { parsePagination, paginateResponse } from '../lib/params.js';

const router = Router();

router.use(requireAuth);

/** GET /api/users/roles — roles available for this company (user picker + role management) */
router.get('/roles', requirePermission('usuarios.leer'), async (req, res) => {
  const roles = await prisma.role.findMany({
    where: tenantWhere(req),
    select: {
      id: true,
      name: true,
      description: true,
      permissions: { select: { permission: { select: { name: true } } } },
      _count: { select: { users: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(
    roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions.map((rp) => rp.permission.name).filter((name) => !PLATFORM_ONLY_PERMISSIONS.includes(name)),
      permissionCount: r.permissions.filter((rp) => !PLATFORM_ONLY_PERMISSIONS.includes(rp.permission.name)).length,
      userCount: r._count.users,
    })),
  );
});

/** GET /api/users/permissions — GLOBAL permission catalog (assignable to roles) */
router.get('/permissions', requirePermission('usuarios.leer'), async (req, res) => {
  const permissions = await prisma.permission.findMany({
    select: { id: true, name: true, description: true },
    orderBy: { name: 'asc' },
  });
  res.json(permissions.filter((p) => !PLATFORM_ONLY_PERMISSIONS.includes(p.name)));
});

/**
 * A role manager cannot grant permissions they do not already hold.
 */
async function unheldPermissions(req: Parameters<typeof getUserPermissions>[0], names: string[]): Promise<string[]> {
  const held = await getUserPermissions(req);
  return [...new Set(names)].filter((n) => !held.has(n));
}

const roleSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(50),
  description: z.string().trim().max(500).nullish(),
  permissionNames: z.array(z.string().trim().min(1)).min(1, 'El rol debe tener al menos un permiso'),
});

/** Resolves permission names against the GLOBAL catalog; null on unknown name. */
async function resolvePermissionsOrNull(tx: { permission: { findMany: typeof prisma.permission.findMany } }, names: string[]) {
  const unique = [...new Set(names)];
  const rows = await tx.permission.findMany({ where: { name: { in: unique } } });
  if (rows.length !== unique.length) return null;
  return rows;
}

/** POST /api/users/roles — create a FULLY CUSTOM role from the global catalog */
router.post('/roles', requirePermission('usuarios.escribir'), async (req, res) => {
  const data = parseBody(res, roleSchema, req.body);
  if (!data) return;
  const companyId = req.authUser!.companyId;
  const { name, description, permissionNames } = data;
  if (name === 'Super Admin') {
    res.status(403).json({ error: 'El rol Super Admin está reservado' });
    return;
  }

  const duplicate = await prisma.role.findFirst({ where: { companyId, name } });
  if (duplicate) {
    res.status(409).json({ error: 'Ya existe un rol con ese nombre' });
    return;
  }

  const catalog = await resolvePermissionsOrNull(prisma, permissionNames);
  if (!catalog) {
    res.status(400).json({ error: 'Permiso desconocido en permissionNames' });
    return;
  }

  const forbidden = await unheldPermissions(req, permissionNames);
  if (forbidden.length > 0) {
    res.status(400).json({ error: `Permiso no autorizado: ${forbidden.join(', ')}` });
    return;
  }

  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: {
        companyId,
        name,
        description: description ?? null,
        permissions: { create: catalog.map((p) => ({ permissionId: p.id })) },
      },
      select: { id: true, name: true, description: true },
    });
    await logAudit(
      tx,
      companyId,
      req.authUser!.userId,
      {
        action: 'Creación de Rol',
        module: 'Configuración',
        entity: 'Role',
        entityId: created.id,
        details: `Rol ${name} creado con ${catalog.length} permiso(s)`,
      },
      clientIp(req),
    );
    return created;
  });

  res.status(201).json({ ...role, permissions: catalog.map((p) => p.name) });
});

const patchRoleSchema = roleSchema.partial().extend({
  permissionNames: z.array(z.string().trim().min(1)).min(1).optional(),
});

/** PATCH /api/users/roles/:id — rename + replace permission set (Super Admin keeps full set) */
router.patch('/roles/:id', requirePermission('usuarios.escribir'), async (req, res) => {
  const data = parseBody(res, patchRoleSchema, req.body);
  if (!data) return;
  const companyId = req.authUser!.companyId;
  const roleId = Number(req.params.id);
  if (!Number.isInteger(roleId) || roleId <= 0) {
    res.status(400).json({ error: 'Rol no válido' });
    return;
  }
  const role = await prisma.role.findFirst({
    where: { id: roleId, companyId },
    select: { id: true, name: true },
  });
  if (!role) {
    res.status(404).json({ error: 'Rol no encontrado' });
    return;
  }

  const isSuperAdmin = role.name === 'Super Admin';
  if (isSuperAdmin && data.name !== undefined && data.name !== role.name) {
    res.status(400).json({ error: "El rol 'Super Admin' no puede renombrarse" });
    return;
  }
  if (!isSuperAdmin && data.name === 'Super Admin') {
    res.status(403).json({ error: 'El rol Super Admin está reservado' });
    return;
  }
  if (data.name !== undefined) {
    const clash = await prisma.role.findFirst({
      where: { companyId, name: data.name, id: { not: roleId } },
    });
    if (clash) {
      res.status(409).json({ error: 'Ya existe un rol con ese nombre' });
      return;
    }
  }

  let catalog: { id: number; name: string }[] | null = null;
  if (data.permissionNames !== undefined) {
    const resolved = await resolvePermissionsOrNull(prisma, data.permissionNames);
    if (!resolved) {
      res.status(400).json({ error: 'Permiso desconocido en permissionNames' });
      return;
    }
    catalog = resolved;
    const forbidden = await unheldPermissions(req, data.permissionNames);
    if (forbidden.length > 0) {
      res.status(400).json({ error: `Permiso no autorizado: ${forbidden.join(', ')}` });
      return;
    }
    if (isSuperAdmin) {
      // Legacy platform permissions are never part of the tenant role contract.
      const required = await prisma.permission.findMany({
        where: { name: { notIn: PLATFORM_ONLY_PERMISSIONS } },
        select: { name: true },
      });
      const have = new Set(catalog.map((p) => p.name));
      const missing = required.filter((p) => !have.has(p.name));
      if (missing.length > 0) {
        res.status(400).json({ error: "El rol 'Super Admin' debe conservar todos los permisos" });
        return;
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (catalog !== null) {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: catalog.map((p) => ({ roleId, permissionId: p.id })),
      });
    }
    const next = await tx.role.update({
      where: { id: roleId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        permissions: { select: { permission: { select: { name: true } } } },
      },
    });
    await logAudit(
      tx,
      companyId,
      req.authUser!.userId,
      {
        action: 'Edición de Rol',
        module: 'Configuración',
        entity: 'Role',
        entityId: roleId,
        details: `Rol ${next.name} actualizado`,
      },
      clientIp(req),
    );
    return next;
  });

  res.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    permissions: updated.permissions.map((rp) => rp.permission.name).filter((name) => !PLATFORM_ONLY_PERMISSIONS.includes(name)),
  });
});

/** DELETE /api/users/roles/:id — blocked for 'Super Admin' (400) or roles with users (409) */
router.delete('/roles/:id', requirePermission('usuarios.escribir'), async (req, res) => {
  const companyId = req.authUser!.companyId;
  const roleId = Number(req.params.id);
  if (!Number.isInteger(roleId) || roleId <= 0) {
    res.status(400).json({ error: 'Rol no válido' });
    return;
  }
  const role = await prisma.role.findFirst({
    where: { id: roleId, companyId },
    select: { id: true, name: true, _count: { select: { users: true } } },
  });
  if (!role) {
    res.status(404).json({ error: 'Rol no encontrado' });
    return;
  }
  if (role.name === 'Super Admin') {
    res.status(400).json({ error: "El rol 'Super Admin' no puede eliminarse" });
    return;
  }
  if (role._count.users > 0) {
    res.status(409).json({ error: 'El rol tiene usuarios asignados y no puede eliminarse' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.role.delete({ where: { id: roleId } });
    await logAudit(
      tx,
      companyId,
      req.authUser!.userId,
      {
        action: 'Eliminación de Rol',
        module: 'Configuración',
        entity: 'Role',
        entityId: roleId,
        details: `Rol ${role.name} eliminado`,
      },
      clientIp(req),
    );
  });

  res.status(204).end();
});

/** GET /api/users — tenant-scoped users with roles and last access */
router.get('/', requirePermission('usuarios.leer'), async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination !== null && 'error' in pagination) {
    res.status(400).json({ error: pagination.error });
    return;
  }
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

  const shaped = users.map((u) => ({
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
  }));
  res.json(pagination ? paginateResponse(shaped, pagination) : shaped);
});

const createUserSchema = z.object({
  firstName: z.string().min(2).max(80),
  lastName: z.string().min(2).max(80),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
  roleId: z.number().int().positive(),
  // A null branch grants no branch access unless the user holds Super Admin.
  branchId: z.number().int().positive().nullable().optional(),
});

async function resolveBranchOr400(companyId: number, branchId: number | null | undefined) {
  if (branchId === undefined || branchId === null) return null;
  const branch = await prisma.branch.findFirst({ where: { id: branchId, companyId } });
  return branch ?? 'invalid';
}

/** POST /api/users — creates a user inside the caller's company with a role */
router.post('/', requirePermission('usuarios.escribir'), async (req, res) => {
  const data = parseBody(res, createUserSchema, req.body);
  if (!data) return;
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
  if (role.name === 'Super Admin' && !req.authUser!.isOwner) {
    res.status(403).json({ error: 'Solo el Super Admin puede asignar este rol' });
    return;
  }
  if (!req.authUser!.isOwner) {
    const targetPermissions = await prisma.rolePermission.findMany({
      where: { roleId: role.id }, select: { permission: { select: { name: true } } },
    });
    const unheld = await unheldPermissions(req, targetPermissions.map((rp) => rp.permission.name));
    if (unheld.length > 0) {
      res.status(403).json({ error: 'No podés asignar un rol con permisos que no tenés' });
      return;
    }
  }

  // Only a Super Admin may lock a user to a branch.
  if (data.branchId !== undefined && data.branchId !== null) {
    if (!req.authUser!.isOwner) {
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
  // null clears the assignment; only Super Admin retains all-branch access.
  branchId: z.number().int().positive().nullable(),
});

/** PATCH /api/users/:id/branch — lock/unlock a user to a branch (Super Admin only) */
router.patch('/:id/branch', requirePermission('usuarios.escribir'), async (req, res) => {
  const data = parseBody(res, setBranchSchema, req.body);
  if (!data) return;
  const companyId = req.authUser!.companyId;
  if (!req.authUser!.isOwner) {
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

  const branch = await resolveBranchOr400(companyId, data.branchId);
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
