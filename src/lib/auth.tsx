import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { apiFetch, clearToken, setToken } from './api';

export interface AuthCompany {
  id: number;
  name: string;
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

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);

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