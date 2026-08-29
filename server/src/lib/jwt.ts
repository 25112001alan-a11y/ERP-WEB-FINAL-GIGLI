import jwt from 'jsonwebtoken';

const configured = process.env.JWT_SECRET;
if (!configured) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción. Configuralo en el entorno.');
  }
  console.warn('[jwt] JWT_SECRET no definido — usando secreto de desarrollo. Configuralo en server/.env.');
}
const JWT_SECRET = configured || 'dev-only-secret-not-for-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export interface AuthTokenPayload {
  sub: number; // userId
  companyId: number;
  email: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as unknown as AuthTokenPayload;
}
