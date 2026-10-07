import { NextFunction, Request, Response } from 'express';
import { verifyToken, verifyPlatformToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';

// Extend Express Request with the authenticated user context.
export interface AuthUser {
  userId: number;
  companyId: number;
  email: string;
  branchId: number | null;
  isOwner: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      platformUser?: { id: number; email: string };
    }
  }
}

/**
 * Validates the Bearer token and attaches the authenticated user context.
 * Fails closed: any missing/invalid token => 401.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token no proporcionado' });
    return;
  }

  let payload;
  try {
    payload = verifyToken(header.slice(7));
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, companyId: true, email: true, status: true, branchId: true,
      roles: { where: { role: { companyId: payload.companyId, name: 'Super Admin' } }, select: { roleId: true } } },
  });

  if (!user || user.status !== 'Activo') {
    res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    return;
  }

  // Tenancy binding: the token's company must match the user's company.
  if (user.companyId !== payload.companyId) {
    res.status(403).json({ error: 'Contexto de empresa inválido' });
    return;
  }

  req.authUser = { userId: user.id, companyId: user.companyId, email: user.email,
    branchId: user.branchId, isOwner: user.roles.length > 0 };
  next();
}

export async function requirePlatformAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token no proporcionado' });
    return;
  }

  let platformUserId: number;
  try {
    platformUserId = verifyPlatformToken(header.slice(7));
  } catch {
    // A valid tenant session has no platform access, but 401 would make the ERP
    // client discard that session globally. Invalid tokens still receive 401.
    try {
      verifyToken(header.slice(7));
    } catch {
      res.status(401).json({ error: 'Token inválido o expirado' });
      return;
    }
    res.status(403).json({ error: 'Acceso de plataforma requerido' });
    return;
  }

  const user = await prisma.platformUser.findUnique({
    where: { id: platformUserId },
    select: { id: true, email: true, status: true },
  });
  if (!user || user.status !== 'Activo') {
    res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    return;
  }
  req.platformUser = { id: user.id, email: user.email };
  next();
}

export function requireAssignedBranch(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser!.isOwner && req.authUser!.branchId === null) {
    res.status(403).json({ error: 'Solicitá al Super Admin que te asigne una sucursal' });
    return;
  }
  next();
}

/** Explicit document branch takes precedence; a null branch falls back to the header warehouse.
 * Contradictory warehouse/destination/source references are never visible to branch users. */
export function documentBranchWhere(req: Request): Prisma.DocumentWhereInput {
  const { companyId, branchId, isOwner } = req.authUser!;
  if (isOwner) return { companyId };
  if (branchId === null) return { companyId, id: -1 };
  const branchMatch: Prisma.DocumentWhereInput = {
    companyId,
    OR: [{ branchId }, { branchId: null, warehouse: { branchId, companyId } }],
    AND: [
      { OR: [{ warehouseId: null }, { warehouse: { branchId, companyId } }] },
      { OR: [{ destinationWarehouseId: null }, { destinationWarehouse: { branchId, companyId } }] },
      { stockMovements: { every: { AND: [
        { OR: [{ warehouseFromId: null }, { warehouseFrom: { branchId, companyId } }] },
        { OR: [{ warehouseToId: null }, { warehouseTo: { branchId, companyId } }] },
      ] } } },
    ],
  };
  return { ...branchMatch,
    AND: [...(branchMatch.AND as Prisma.DocumentWhereInput[]),
      { OR: [{ sourceDocumentId: null }, { sourceDocument: { is: branchMatch } }] }] };
}

/**
 * Legacy tenant permission names that must never grant platform authority.
 */
export const PLATFORM_ONLY_PERMISSIONS = ['billing.manage'];

/**
 * Tenancy helper: every business query MUST be scoped to the authenticated
 * company. Returns the Prisma where clause for the current tenant.
 */
export function tenantWhere(req: Request): { companyId: number } {
  const auth = req.authUser;
  if (!auth) {
    throw new Error('tenantWhere requires requireAuth to run first');
  }
  return { companyId: auth.companyId };
}

/**
 * Loads the current user's permission names as a set.
 * Shared by requirePermission/requireAnyPermission and inline permission checks.
 */
export async function getUserPermissions(req: Request): Promise<Set<string>> {
  const auth = req.authUser;
  if (!auth) return new Set();
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      roles: {
        where: { role: { companyId: auth.companyId } },
        select: {
          role: {
            select: {
              permissions: { select: { permission: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  return new Set(
    (user?.roles ?? []).flatMap((ur) =>
      ur.role.permissions.map((rp) => rp.permission.name).filter((name) => !PLATFORM_ONLY_PERMISSIONS.includes(name)),
    ),
  );
}

/**
 * Guards routes by a single permission (e.g. 'inventario.escribir').
 * Loads the user's permissions from the DB on every request — simple, correct,
 * and cheap enough for this scale. Requires requireAuth to have run first.
 */
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.authUser;
    if (!auth) {
      res.status(401).json({ error: 'Autenticación requerida' });
      return;
    }

    const permissions = await getUserPermissions(req);

    if (!permissions.has(permission)) {
      res.status(403).json({ error: `Permiso requerido: ${permission}` });
      return;
    }

    next();
  };
}

/**
 * Guards routes by ANY of the given permissions, e.g.
 * requireAnyPermission('ventas.leer', 'compras.leer') for the unified
 * documents list, which contains both sales and purchase documents.
 */
export function requireAnyPermission(...permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.authUser;
    if (!auth) {
      res.status(401).json({ error: 'Autenticación requerida' });
      return;
    }

    const userPermissions = await getUserPermissions(req);

    if (!permissions.some((p) => userPermissions.has(p))) {
      res.status(403).json({ error: `Permiso requerido: ${permissions.join(' o ')}` });
      return;
    }

    next();
  };
}
