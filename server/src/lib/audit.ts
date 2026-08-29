import type { Prisma } from '@prisma/client';
import type { Request } from 'express';

export interface AuditEntry {
  action: string;
  module: string;
  entity?: string;
  entityId?: number;
  details?: string;
}

/**
 * Persists an AuditLog row. `tx` lets callers write the log inside the same
 * business transaction that produced the event (atomicity with the action).
 */
export async function logAudit(
  tx: Prisma.TransactionClient,
  companyId: number,
  userId: number,
  entry: AuditEntry,
  ip?: string,
) {
  await tx.auditLog.create({
    data: {
      companyId,
      userId,
      action: entry.action,
      module: entry.module,
      entity: entry.entity,
      entityId: entry.entityId,
      details: entry.details,
      ip: ip ?? null,
    },
  });
}

/** Resolves the client IP in a predictable way for app-level audit rows. */
export function clientIp(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? undefined;
}