import { z } from 'zod';

const idSchema = z.coerce.number().int().positive();

/** Returns a positive int or null — route handlers return 400 on null. */
export function parsePositiveInt(raw: unknown): number | null {
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}