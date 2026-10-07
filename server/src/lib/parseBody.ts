import type { Response } from 'express';
import { z } from 'zod';

/**
 * Valida `body` contra `schema`. Éxito → datos tipados.
 * Fallo → responde 400 { error, details } y devuelve null
 * (el handler debe hacer `return` inmediatamente).
 */
export function parseBody<T>(
  res: Response,
  schema: z.ZodType<T>,
  body: unknown,
  errorMessage = 'Datos inválidos',
): T | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: errorMessage, details: parsed.error.flatten() });
    return null;
  }
  return parsed.data;
}
