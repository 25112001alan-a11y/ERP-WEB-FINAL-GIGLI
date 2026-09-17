import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

/**
 * Rate limiting for the public API surface.
 *
 * Limits are per client IP and rely on `app.set('trust proxy', 1)` so the real
 * client address is read from X-Forwarded-For behind Railway's proxy.
 *
 * Every limiter can be globally disabled with RATE_LIMIT_DISABLED=true. The
 * server test suite sets that flag because it performs many auth calls per run
 * against a live database; the limiter logic itself is covered by a dedicated
 * test that builds its own strict instance.
 */

const disabled = (): boolean => process.env.RATE_LIMIT_DISABLED === 'true';

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export interface RateLimiterOptions {
  windowMs: number;
  limit: number;
  message: string;
}

/** Builds a limiter. Exported so tests can exercise a strict instance. */
export function makeRateLimiter({ windowMs, limit, message }: RateLimiterOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => disabled(),
    message: { error: message },
  });
}

const MINUTE = 60 * 1000;

/** Baseline limiter applied to every /api route. */
export const apiLimiter = makeRateLimiter({
  windowMs: 15 * MINUTE,
  limit: envInt('RATE_LIMIT_API_MAX', 300),
  message: 'Demasiadas solicitudes. Intente nuevamente en unos minutos.',
});

/** Login: strict per-IP limit, complemented by the per-account lockout. */
export const loginLimiter = makeRateLimiter({
  windowMs: 15 * MINUTE,
  limit: envInt('RATE_LIMIT_LOGIN_MAX', 10),
  message: 'Demasiados intentos de acceso. Intente nuevamente en unos minutos.',
});

/** Register: account creation is expensive (company + role + user), so cap it hard. */
export const registerLimiter = makeRateLimiter({
  windowMs: 60 * MINUTE,
  limit: envInt('RATE_LIMIT_REGISTER_MAX', 10),
  message: 'Demasiados registros desde esta dirección. Intente más tarde.',
});

/** Public storefront + anonymous checkout (unauthenticated). */
export const publicLimiter = makeRateLimiter({
  windowMs: 15 * MINUTE,
  limit: envInt('RATE_LIMIT_PUBLIC_MAX', 60),
  message: 'Demasiadas solicitudes. Intente nuevamente en unos minutos.',
});
