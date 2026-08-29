import React, { useState } from 'react';
import { ViewPath } from '../../types';
import { useAuth } from '../../lib/auth';

interface AuthLoginViewProps {
  onNavigate: (view: ViewPath) => void;
  onLoginSuccess: (userEmail: string) => void;
}

export const AuthLoginView: React.FC<AuthLoginViewProps> = ({ onNavigate, onLoginSuccess }) => {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('ana.silva@empresa.com');
  const [password, setPassword] = useState('password123');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const user = await login({ email, password });
      onLoginSuccess(user.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    }
  };

  return (
    <div className="min-h-screen w-full bg-surface flex items-center justify-center p-md relative overflow-hidden -m-lg">
      {/* Decorative gradient blur */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/30 max-w-md w-full p-xl relative z-10 flex flex-col gap-lg">
        {/* Logo Header */}
        <div className="flex flex-col items-center text-center gap-xs">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-on-primary font-bold text-headline-lg shadow-md mb-xs">
            N
          </div>
          <h1 className="font-display-lg text-headline-lg text-on-surface">Nexus ERP Enterprise</h1>
          <p className="font-body-md text-on-surface-variant">Iniciá sesión en tu cuenta de organización</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <label className="font-label-md text-label-md uppercase text-on-surface-variant">Correo Corporativo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <div className="flex justify-between items-center">
              <label className="font-label-md text-label-md uppercase text-on-surface-variant">Contraseña</label>
              <a href="#forgot" onClick={(e) => { e.preventDefault(); alert('Instrucciones enviadas a tu correo'); }} className="text-xs text-primary hover:underline">
                ¿Olvidaste tu contraseña?
              </a>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-mono-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-xs text-xs text-on-surface-variant cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="accent-primary"
              />
              Recordar este dispositivo
            </label>
          </div>

          {error && (
            <div className="bg-error-container text-on-error-container rounded-lg px-sm py-xs font-body-md text-body-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary font-label-md text-label-md py-md rounded-lg shadow-md hover:shadow-lg transition-all cursor-pointer mt-xs disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Verificando...' : 'Iniciar Sesión'}
          </button>
        </form>

        {/* Demo shortcuts */}
        <div className="border-t border-outline-variant/20 pt-md text-center flex flex-col gap-xs">
          <p className="font-label-md text-xs text-on-surface-variant uppercase tracking-wider">Demostración Rápida</p>
          <div className="flex gap-xs justify-center flex-wrap">
            <button
              type="button"
              onClick={() => { setEmail('ana.silva@empresa.com'); }}
              className="px-xs py-0.5 rounded bg-surface-container-high text-xs text-on-surface hover:bg-primary-container"
            >
              Ana (Admin)
            </button>
            <button
              type="button"
              onClick={() => { setEmail('c.perez@empresa.com'); }}
              className="px-xs py-0.5 rounded bg-surface-container-high text-xs text-on-surface hover:bg-primary-container"
            >
              Carlos (Ventas)
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-on-surface-variant">
          ¿No tenés una cuenta?{' '}
          <button onClick={() => onNavigate('auth-register')} className="text-primary font-semibold hover:underline cursor-pointer">
            Registrar nueva empresa
          </button>
        </div>
      </div>
    </div>
  );
};
