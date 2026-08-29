import React, { useState } from 'react';
import { ViewPath } from '../../types';
import { useAuth } from '../../lib/auth';

interface AuthRegisterViewProps {
  onNavigate: (view: ViewPath) => void;
  onRegisterSuccess: (companyName: string) => void;
}

export const AuthRegisterView: React.FC<AuthRegisterViewProps> = ({ onNavigate, onRegisterSuccess }) => {
  const { register, loading } = useAuth();
  const [companyName, setCompanyName] = useState('Mi Empresa SaaS');
  const [adminName, setAdminName] = useState('Juan Admin');
  const [email, setEmail] = useState('juan@miempresa.com');
  const [password, setPassword] = useState('Secret123!');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const [firstName, ...lastParts] = adminName.trim().split(' ');
    try {
      const user = await register({
        companyName,
        firstName: firstName || adminName,
        lastName: lastParts.join(' '),
        email,
        password,
      });
      onRegisterSuccess(user.company?.name ?? companyName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta');
    }
  };

  return (
    <div className="min-h-screen w-full bg-surface flex items-center justify-center p-md relative overflow-hidden -m-lg">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/30 max-w-md w-full p-xl relative z-10 flex flex-col gap-lg">
        <div className="flex flex-col items-center text-center gap-xs">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-on-primary font-bold text-headline-lg shadow-md mb-xs">
            N
          </div>
          <h1 className="font-display-lg text-headline-lg text-on-surface">Crear Cuenta Enterprise</h1>
          <p className="font-body-md text-on-surface-variant">Registrá tu organización en Nexus ERP</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <label className="font-label-md text-label-md uppercase text-on-surface-variant">Nombre de la Empresa</label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ej. Logística Sur S.A."
              className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-label-md text-label-md uppercase text-on-surface-variant">Tu Nombre Completo</label>
            <input
              type="text"
              required
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Juan Pérez"
              className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-label-md text-label-md uppercase text-on-surface-variant">Correo Electrónico Corporativo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="juan@empresa.com"
              className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-label-md text-label-md uppercase text-on-surface-variant">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-mono-sm"
            />
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
            {loading ? 'Creando cuenta...' : 'Registrar Organización'}
          </button>
        </form>

        <div className="text-center text-xs text-on-surface-variant">
          ¿Ya tenés una cuenta?{' '}
          <button onClick={() => onNavigate('auth-login')} className="text-primary font-semibold hover:underline cursor-pointer">
            Iniciar sesión
          </button>
        </div>
      </div>
    </div>
  );
};
