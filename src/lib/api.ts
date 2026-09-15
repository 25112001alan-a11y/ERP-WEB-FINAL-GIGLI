// Nexus ERP API client.
// Base URL: Vite dev proxy would be ideal; for now point straight at the API server.
export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export const TOKEN_KEY = 'nexus.auth.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `Error ${res.status}`;
    let details: unknown;
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') message = data.error;
      details = data?.details;
    } catch {
      // non-JSON error body; keep the status-based message
    }
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Multipart upload (file attachment). No Content-Type is set: the browser adds
 * the boundary for FormData automatically. */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    let message = `Error ${res.status}`;
    let details: unknown;
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') message = data.error;
      details = data?.details;
    } catch {
      // keep the status-based message
    }
    throw new ApiError(res.status, message, details);
  }

  return (await res.json()) as T;
}