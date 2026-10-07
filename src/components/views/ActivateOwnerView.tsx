import { useRef, useState, type FormEvent } from 'react';
import { API_BASE } from '../../lib/api';

export function ActivateOwnerView({ token: initialToken }: { token: string | null }) {
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const submitting = useRef(false);

  const activate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || submitting.current) return;
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/auth/activate-owner`, {
        method: 'POST',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) throw new Error('Activation failed');
      setToken(null);
      setPassword('');
      setConfirmation('');
      setSuccess(true);
    } catch {
      setError('No se pudo activar la cuenta. El enlace puede ser inválido, haber vencido o ya haber sido utilizado. Si el problema continúa, contacte a soporte.');
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  return <main className="min-h-screen bg-surface text-on-surface font-sans p-lg">
    <div className="mx-auto max-w-[28rem] rounded-xl bg-surface-container-lowest p-lg shadow-sm space-y-md">
      <h1 className="text-2xl font-bold">Activar cuenta de dueño</h1>
      {success ? <>
        <p role="status">Cuenta activada. Ya puede iniciar sesión con su email y contraseña.</p>
        <a href="/" className="text-primary underline">Ir al inicio de sesión empresarial</a>
      </> : !token ? <p role="alert" className="text-error">El enlace de activación no es válido. Solicite ayuda al administrador de la plataforma.</p> : <form onSubmit={(event) => void activate(event)} className="space-y-md">
        <p>Elija una contraseña para su cuenta empresarial. El enlace solo se puede usar una vez.</p>
        <label className="block">Contraseña
          <input type="password" required minLength={8} maxLength={100} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
        </label>
        <label className="block">Confirmar contraseña
          <input type="password" required minLength={8} maxLength={100} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
        </label>
        {error && <p role="alert" className="text-error">{error}</p>}
        <button type="submit" disabled={pending} className="rounded-lg bg-primary px-md py-sm text-on-primary cursor-pointer disabled:opacity-50">{pending ? 'Activando…' : 'Activar cuenta'}</button>
      </form>}
    </div>
  </main>;
}
