import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  apiFetch,
  clearToken,
  setToken,
  getToken,
  AUTH_UNAUTHORIZED_EVENT,
} from './api';
import type { ViewPath } from '../types';

export interface AuthCompany {
  id: number;
  name: string;
  slug: string | null;
  currency: string;
}

export interface AllowedBranch {
  id: number;
  name: string;
}

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  company: AuthCompany | null;
  roles: string[];
  permissions: string[];
  // Branch lock: set = user locked to that branch; null = owner/all-access.
  branchId: number | null;
  isOwner: boolean;
  allowedBranches: AllowedBranch[];
}

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  currency?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  refreshMe: () => Promise<AuthUser>;
  logout: () => void;
}

/** Shape of GET /api/auth/me — same public fields as AuthUser. */
type MeResponse = AuthUser;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Starts true: the app waits for the session restore before rendering UI.
  const [loading, setLoading] = useState(true);

  // Session restore: a persisted token is revalidated against /api/auth/me so a
  // page refresh keeps the user logged in. Invalid/expired tokens are cleared.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getToken()) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await apiFetch<MeResponse>('/api/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        // No user on screen; apiFetch already fired the unauthorized event.
        clearToken();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global 401: any module can lose the session (expired token, revoked account).
  useEffect(() => {
    const onUnauthorized = () => {
      clearToken();
      setUser(null);
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (payload: LoginPayload): Promise<AuthUser> => {
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: payload,
        auth: false,
      });
      setToken(data.token);
      const me = await apiFetch<{
        id: number;
        firstName: string;
        lastName: string;
        email: string;
        company: AuthCompany | null;
        roles: string[];
        permissions: string[];
        branchId: number | null;
        isOwner: boolean;
        allowedBranches: AllowedBranch[];
      }>('/api/auth/me');
      const authUser: AuthUser = me;
      setUser(authUser);
      return authUser;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (payload: RegisterPayload): Promise<AuthUser> => {
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string }>('/api/auth/register', {
        method: 'POST',
        body: {
          companyName: payload.companyName,
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email,
          password: payload.password,
          currency: payload.currency,
        },
        auth: false,
      });
      setToken(data.token);
      const me = await apiFetch<{
        id: number;
        firstName: string;
        lastName: string;
        email: string;
        company: AuthCompany | null;
        roles: string[];
        permissions: string[];
        branchId: number | null;
        isOwner: boolean;
        allowedBranches: AllowedBranch[];
      }>('/api/auth/me');
      const authUser: AuthUser = me;
      setUser(authUser);
      return authUser;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMe = useCallback(async (): Promise<AuthUser> => {
    const me = await apiFetch<AuthUser>('/api/auth/me');
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, refreshMe, logout }),
    [user, loading, login, register, refreshMe, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

// ---- Frontend permission gating -------------------------------------------
// The backend enforces fail-closed 403; these helpers only decide what the UI
// fetches and renders so restricted users never see phantom error banners or
// nav items they cannot open.

/** True when the session holds the required permission (string = all, array = any). */
export function can(
  permissions: string[] | undefined | null,
  required: string | string[] | null | undefined,
): boolean {
  if (required == null) return true;
  if (!permissions) return false;
  return Array.isArray(required)
    ? required.some((r) => permissions.includes(r))
    : permissions.includes(required);
}

/**
 * Required `.leer` permission per view. `null` = visible to any authenticated
 * user (dashboard) or public (portal/auth). Mirrors the backend route guards:
 * documents endpoints accept ventas.leer OR compras.leer, dashboard accepts
 * any of ventas/compras/finanzas/reportes.
 */
export const VIEW_PERMISSIONS: Record<ViewPath, string | string[] | null> = {
  dashboard: null,
  inventario: 'inventario.leer',
  'inventario-ajuste': 'inventario.leer',
  'inventario-transferencia': 'inventario.leer',
  'inventario-nuevo-producto': 'inventario.leer',
  pos: 'ventas.leer',
  ventas: 'ventas.leer',
  'remito-salida': 'ventas.leer',
  'pedidos-publicos': ['ventas.leer', 'compras.leer'],
  'nuevo-pedido-manual': ['ventas.leer', 'compras.leer'],
  compras: 'compras.leer',
  'nueva-orden-compra': 'compras.leer',
  'registrar-remito': 'compras.leer',
  'registrar-factura': ['ventas.leer', 'compras.leer'],
  finanzas: 'finanzas.leer',
  reportes: 'reportes.leer',
  configuracion: 'configuracion.leer',
  administracion: 'usuarios.leer',
  'nuevo-usuario': 'usuarios.leer',
  'log-auditoria': 'auditoria.leer',
  'portal-clientes': null,
  'auth-login': null,
  'auth-register': null,
  pricing: null,
};