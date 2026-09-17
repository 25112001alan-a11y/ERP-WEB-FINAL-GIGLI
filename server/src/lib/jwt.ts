import jwt from 'jsonwebtoken';

const configured = process.env.JWT_SECRET;
if (!configured) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción. Configuralo en el entorno.');
  }
  console.warn('[jwt] JWT_SECRET no definido — usando secreto de desarrollo. Configuralo en server/.env.');
}
// The dev fallback is only reachable outside production (production throws above).
const JWT_SECRET = configured || 'dev-only-secret-not-for-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// Tokens are bound to an issuer/audience and pinned to HS256 so a token minted
// for another service (or with a different algorithm) can never be replayed here.
const JWT_ISSUER = process.env.JWT_ISSUER || 'nexus-erp';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'nexus-erp-web';

export interface AuthTokenPayload {
  sub: number; // userId
  companyId: number;
  email: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithm: 'HS256',
  });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ['HS256'],
  }) as unknown as AuthTokenPayload;
}
