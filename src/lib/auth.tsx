import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  apiFetch,
  clearToken,
  setToken,
  getToken,
  AUTH_UNAUTHORIZED_EVENT,
} from './api';

export interface AuthCompany {
  id: number;
  name: string;
  slug: string | null;
  currency: string;
}

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  company: AuthCompany | null;
  roles: string[];
  permissions: string[];
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
      }>('/api/auth/me');
      const authUser: AuthUser = me;
      setUser(authUser);
      return authUser;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
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