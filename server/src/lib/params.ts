import { z } from 'zod';

const idSchema = z.coerce.number().int().positive();

/** Returns a positive int or null — route handlers return 400 on null. */
export function parsePositiveInt(raw: unknown): number | null {
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const PAGINATION_DEFAULT_LIMIT = 50;
export const PAGINATION_MAX_LIMIT = 200;

export type Pagination = { page: number; limit: number };
export type PaginationError = { error: string };

/**
 * Opt-in pagination for GET list endpoints.
 * - No `page`/`limit` params → null (caller returns the full array, as today).
 * - Params present → { page, limit } (1-based page, default 1; limit default
 *   50, capped at 200). Garbage (non-integer, < 1) → { error } (caller 400s).
 */
export function parsePagination(query: {
  page?: unknown;
  limit?: unknown;
}): Pagination | PaginationError | null {
  const { page: rawPage, limit: rawLimit } = query;
  if (rawPage === undefined && rawLimit === undefined) return null;
  const page = rawPage === undefined ? 1 : parsePositiveInt(rawPage);
  const rawLimitParsed = rawLimit === undefined ? PAGINATION_DEFAULT_LIMIT : parsePositiveInt(rawLimit);
  if (page === null || rawLimitParsed === null) {
    return { error: 'Parámetros de paginación inválidos' };
  }
  // ponytail: page/limit validated here; MySQL skip is an Int (max 2^31-1) so a
  // huge page must 400 before reaching Prisma.
  const limit = Math.min(rawLimitParsed, PAGINATION_MAX_LIMIT);
  if ((page - 1) * limit > 2147483647) {
    return { error: 'Parámetros de paginación inválidos' };
  }
  return { page, limit };
}

/** Wraps a DB-paged slice in the paginated envelope with the full-row count. */
export function paginateResponse<T>(data: T[], pagination: Pagination, total: number) {
  return {
    data,
    page: pagination.page,
    limit: pagination.limit,
    total,
  };
}