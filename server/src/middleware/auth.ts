import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

// Extend Express Request with the authenticated user context.
export interface AuthUser {
  userId: number;
  companyId: number;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
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
    select: { id: true, companyId: true, email: true, status: true },
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

  req.authUser = { userId: user.id, companyId: user.companyId, email: user.email };
  next();
}

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

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        roles: {
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

    const permissions = new Set(
      (user?.roles ?? []).flatMap((ur) =>
        ur.role.permissions.map((rp) => rp.permission.name),
      ),
    );

    if (!permissions.has(permission)) {
      res.status(403).json({ error: `Permiso requerido: ${permission}` });
      return;
    }

    next();
  };
}
