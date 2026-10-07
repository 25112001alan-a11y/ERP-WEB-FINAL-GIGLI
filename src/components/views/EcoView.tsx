import { useEffect, useRef, useState, type FormEvent } from 'react';
import { API_BASE } from '../../lib/api';
import { formatMoney } from '../../lib/format';

const PLATFORM_TOKEN_KEY = 'nexus.platform.token';

interface Overview {
  totals: {
    companies: number;
    activeSubscriptions: number;
    pastDueSubscriptions: number;
    canceledSubscriptions: number;
    pendingSubscriptions: number;
    mrrUsd: number;
  };
  recentEvents: { eventId: string; topic: string; createdAt: string }[];
  unsubscribedCompanies: { id: number; name: string; slug: string | null }[];
}

interface CompanySummary { id: number; name: string; slug: string | null; currency: string }
interface CompanyDetail extends CompanySummary {
  legalName: string | null;
  timezone: string | null;
  createdAt: string;
}
interface CompanyPage { data: CompanySummary[]; page: number; limit: number; total: number }
interface NewCompany { companyName: string; firstName: string; lastName: string; email: string; currency: string }
interface CompanyEdit { name: string; legalName: string; timezone: string }
const emptyCompany: NewCompany = { companyName: '', firstName: '', lastName: '', email: '', currency: 'ARS' };

async function platformFetch<T>(path: string, token?: string, body?: object, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: body === undefined ? 'GET' : method,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    if (token && (response.status === 401 || response.status === 403) && localStorage.getItem(PLATFORM_TOKEN_KEY) === token) {
      localStorage.removeItem(PLATFORM_TOKEN_KEY);
    }
    throw new Error(response.status === 401 || response.status === 403
      ? 'Sesión ECO inválida o credenciales incorrectas.'
      : 'No se pudo completar la solicitud. Intentá de nuevo.');
  }
  return response.json() as Promise<T>;
}

export function EcoView() {
  const [token, setToken] = useState(() => localStorage.getItem(PLATFORM_TOKEN_KEY));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState<{ id: number; email: string } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [companies, setCompanies] = useState<CompanyPage | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [companyError, setCompanyError] = useState('');
  const [companyPending, setCompanyPending] = useState(false);
  const [editCompany, setEditCompany] = useState<CompanyEdit>({ name: '', legalName: '', timezone: '' });
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [newCompany, setNewCompany] = useState<NewCompany>(emptyCompany);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const operation = useRef(0);
  const createInFlight = useRef(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setPending(true);
    setError('');
    (async () => {
      try {
        const account = await platformFetch<{ id: number; email: string }>('/api/platform/me', token);
        const data = await platformFetch<Overview>('/api/billing/admin/overview', token);
        if (!cancelled) {
          setMe(account);
          setOverview(data);
        }
      } catch (err) {
        if (!cancelled) {
          if (!localStorage.getItem(PLATFORM_TOKEN_KEY)) setToken(null);
          setError(err instanceof Error ? err.message : 'No se pudo cargar el panel ECO.');
        }
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, retry]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setCompanyPending(true);
    setCompanyError('');
    platformFetch<CompanyPage>(`/api/platform/companies?page=${page}`, token)
      .then((data) => { if (!cancelled) setCompanies(data); })
      .catch((err: unknown) => {
        if (!cancelled) {
          if (!localStorage.getItem(PLATFORM_TOKEN_KEY)) setToken(null);
          setCompanyError(err instanceof Error ? err.message : 'No se pudieron cargar las empresas.');
        }
      })
      .finally(() => { if (!cancelled) setCompanyPending(false); });
    return () => { cancelled = true; };
  }, [token, page, retry]);

  useEffect(() => {
    if (!token || companyId === null) return;
    let cancelled = false;
    setCompany(null);
    setCompanyError('');
    platformFetch<CompanyDetail>(`/api/platform/companies/${companyId}`, token)
      .then((data) => { if (!cancelled) setCompany(data); })
      .catch((err: unknown) => {
        if (!cancelled) {
          if (!localStorage.getItem(PLATFORM_TOKEN_KEY)) setToken(null);
          setCompanyError(err instanceof Error ? err.message : 'No se pudo cargar la empresa.');
        }
      });
    return () => { cancelled = true; };
  }, [token, companyId, retry]);

  useEffect(() => {
    if (company) setEditCompany({ name: company.name, legalName: company.legalName ?? '', timezone: company.timezone ?? '' });
  }, [company]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    operation.current++;
    setInvitationLink(null);
    setPending(true);
    setError('');
    try {
      const result = await platformFetch<{ token: string }>('/api/platform/login', undefined, { email, password });
      localStorage.setItem(PLATFORM_TOKEN_KEY, result.token);
      setPassword('');
      setPage(1);
      setCompanyId(null);
      setCompanies(null);
      setToken(result.token);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    }
  };

  const logout = () => {
    operation.current++;
    setInvitationLink(null);
    setCopyStatus('');
    setCreateError('');
    setCreating(false);
    setEditPending(false);
    localStorage.removeItem(PLATFORM_TOKEN_KEY);
    setToken(null);
    setMe(null);
    setOverview(null);
    setCompanies(null);
    setCompanyId(null);
    setCompany(null);
    setEditError('');
    setEditStatus('');
    setError('');
  };

  const createCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || createInFlight.current || editPending) return;
    createInFlight.current = true;
    const attempt = ++operation.current;
    setInvitationLink(null);
    setCopyStatus('');
    setCreateError('');
    setCreating(true);
    try {
      const result = await platformFetch<{ invitationToken: string }>('/api/platform/companies', token, {
        companyName: newCompany.companyName.trim(),
        firstName: newCompany.firstName.trim(),
        lastName: newCompany.lastName.trim(),
        email: newCompany.email.trim(),
        currency: newCompany.currency.toUpperCase(),
      });
      if (attempt !== operation.current || localStorage.getItem(PLATFORM_TOKEN_KEY) !== token) return;
      if (!/^[a-f0-9]{64}$/i.test(result.invitationToken)) throw new Error('No se pudo mostrar el enlace de activación. No repita el alta: contacte a soporte.');
      setInvitationLink(`${window.location.origin}/activate-owner#token=${result.invitationToken}`);
      setNewCompany(emptyCompany);
      setPage(1);
      setCompanyId(null);
      setCompany(null);
      setCompanies(null);
      setRetry((value) => value + 1);
    } catch (err) {
      if (attempt !== operation.current) return;
      if (!localStorage.getItem(PLATFORM_TOKEN_KEY)) setToken(null);
      setCreateError(err instanceof Error && err.message.startsWith('No se pudo mostrar') ? err.message : 'No se pudo confirmar el alta. Revise el listado antes de volver a intentarlo.');
    } finally {
      createInFlight.current = false;
      if (attempt === operation.current) setCreating(false);
    }
  };

  const saveCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !company || editPending || creating) return;
    const name = editCompany.name.trim();
    const legalName = editCompany.legalName.trim() || null;
    const timezone = editCompany.timezone.trim() || null;
    setEditError('');
    setEditStatus('');
    if (name === company.name && legalName === company.legalName && timezone === company.timezone) {
      setEditStatus('No hay cambios para guardar.');
      return;
    }
    const attempt = operation.current;
    setEditPending(true);
    try {
      const updated = await platformFetch<CompanyDetail>(`/api/platform/companies/${company.id}`, token, { name, legalName, timezone }, 'PATCH');
      if (attempt !== operation.current || localStorage.getItem(PLATFORM_TOKEN_KEY) !== token) return;
      setCompany(updated);
      setEditStatus('Empresa actualizada.');
      setRetry((value) => value + 1);
    } catch (err) {
      if (attempt !== operation.current) return;
      if (!localStorage.getItem(PLATFORM_TOKEN_KEY)) setToken(null);
      setEditError(err instanceof Error ? err.message : 'No se pudo actualizar la empresa.');
    } finally {
      if (attempt === operation.current) setEditPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans p-lg">
      <div className="mx-auto max-w-4xl space-y-lg">
        <header className="flex items-center justify-between gap-md border-b border-outline-variant/40 pb-md">
          <div>
            <p className="text-primary font-semibold">ECO · Nexus</p>
            <h1 className="text-2xl font-bold">Panel de plataforma</h1>
          </div>
          {token && <button type="button" onClick={logout} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer">Cerrar sesión</button>}
        </header>

        {!token ? (
          <form onSubmit={(event) => void login(event)} className="max-w-md space-y-md rounded-xl bg-surface-container-lowest p-lg shadow-sm">
            <h2 className="text-xl font-semibold">Acceso ECO</h2>
            <label className="block">Email
              <input type="email" required autoComplete="username" maxLength={150} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
            </label>
            <label className="block">Contraseña
              <input type="password" required autoComplete="current-password" maxLength={100} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
            </label>
            {error && <p role="alert" className="text-error">{error}</p>}
            <button type="submit" disabled={pending} className="rounded-lg bg-primary px-md py-sm text-on-primary cursor-pointer disabled:opacity-50">Ingresar</button>
          </form>
        ) : (
          <main className="space-y-lg">
            {invitationLink && <section aria-label="Enlace de activación" className="rounded-xl border border-primary p-md space-y-sm bg-surface-container-lowest">
              <h2 className="text-lg font-semibold">Empresa creada · enlace de un solo uso</h2>
              <p>Copie este enlace ahora y entréguelo al dueño por un canal privado y seguro. Caduca en 24 horas. No se puede recuperar si se pierde; una nueva emisión auditada requerirá una función futura.</p>
              <label className="block" htmlFor="owner-invitation-link">Enlace de activación</label>
              <input id="owner-invitation-link" type="text" readOnly value={invitationLink} onFocus={(event) => event.currentTarget.select()} className="block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
              <button type="button" onClick={() => { const current = operation.current; if (!navigator.clipboard?.writeText) { setCopyStatus('Seleccione el enlace y cópielo manualmente.'); return; } void navigator.clipboard.writeText(invitationLink).then(() => { if (operation.current === current) setCopyStatus('Enlace copiado.'); }, () => { if (operation.current === current) setCopyStatus('No se pudo copiar automáticamente. Seleccione el enlace y cópielo manualmente.'); }); }} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer">Copiar enlace</button>
              {copyStatus && <p role="status">{copyStatus}</p>}
            </section>}
            {pending && <p role="status">Cargando panel ECO…</p>}
            {error && <div role="alert" className="space-y-sm"><p className="text-error">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer">Reintentar</button></div>}
            {!pending && !error && me && overview && <>
              <section aria-labelledby="eco-create-company" className="rounded-xl bg-surface-container-lowest p-md shadow-sm space-y-sm">
                <h2 id="eco-create-company" className="text-lg font-semibold">Crear empresa y dueño inicial</h2>
                <form onSubmit={(event) => void createCompany(event)} className="grid gap-md sm:grid-cols-2">
                  {([
                    ['companyName', 'Nombre de la empresa', 120],
                    ['firstName', 'Nombre del dueño', 80],
                    ['lastName', 'Apellido del dueño', 80],
                  ] as const).map(([key, label, maxLength]) => <label key={key} className="block">{label}
                    <input required minLength={2} maxLength={maxLength} value={newCompany[key]} onChange={(event) => setNewCompany((value) => ({ ...value, [key]: event.target.value }))} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
                  </label>)}
                  <label className="block">Email del dueño
                    <input type="email" required maxLength={150} autoComplete="off" value={newCompany.email} onChange={(event) => setNewCompany((value) => ({ ...value, email: event.target.value }))} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
                  </label>
                  <label className="block">Moneda (código de 3 letras)
                    <input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={newCompany.currency} onChange={(event) => setNewCompany((value) => ({ ...value, currency: event.target.value }))} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
                  </label>
                  <div className="sm:col-span-2 space-y-sm">
                    {createError && <p role="alert" className="text-error">{createError}</p>}
                    <button type="submit" disabled={creating || editPending} className="rounded-lg bg-primary px-md py-sm text-on-primary cursor-pointer disabled:opacity-50">{creating ? 'Creando…' : 'Crear empresa'}</button>
                  </div>
                </form>
              </section>
              <p className="text-on-surface-variant">Sesión ECO: {me.email}. Resumen global de facturación, solo lectura.</p>
              <section aria-label="Resumen de suscripciones" className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ['Empresas', overview.totals.companies],
                  ['Suscripciones activas', overview.totals.activeSubscriptions],
                  ['Vencidas', overview.totals.pastDueSubscriptions],
                  ['Canceladas', overview.totals.canceledSubscriptions],
                  ['Pendientes', overview.totals.pendingSubscriptions],
                  ['MRR (USD)', formatMoney(overview.totals.mrrUsd, 'USD')],
                ] as const).map(([label, value]) => <div key={label} className="rounded-xl bg-surface-container-lowest p-md shadow-sm"><p className="text-on-surface-variant">{label}</p><p className="text-xl font-bold">{value}</p></div>)}
              </section>
              <section className="rounded-xl bg-surface-container-lowest p-md shadow-sm">
                <h2 className="text-lg font-semibold">Empresas sin suscripción</h2>
                {overview.unsubscribedCompanies.length === 0 ? <p>No hay empresas sin suscripción.</p> : <ul className="list-disc pl-lg">{overview.unsubscribedCompanies.map((company) => <li key={company.id}>{company.name}{company.slug ? ` (${company.slug})` : ''}</li>)}</ul>}
              </section>
              <section className="rounded-xl bg-surface-container-lowest p-md shadow-sm">
                <h2 className="text-lg font-semibold">Eventos recientes de facturación</h2>
                {overview.recentEvents.length === 0 ? <p>No hay eventos recientes.</p> : <ul className="space-y-xs">{overview.recentEvents.map((event) => <li key={event.eventId}>{event.topic} · {new Date(event.createdAt).toLocaleString('es-AR')}</li>)}</ul>}
              </section>
              <section aria-labelledby="eco-companies" className="rounded-xl bg-surface-container-lowest p-md shadow-sm space-y-sm">
                <h2 id="eco-companies" className="text-lg font-semibold">Empresas</h2>
                {companyPending && <p role="status">Cargando empresas…</p>}
                {companyError && <div role="alert"><p className="text-error">{companyError}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer">Reintentar</button></div>}
                {!companyPending && companies && <>
                  {companies.data.length === 0 ? <p>No hay empresas en esta página.</p> : <ul className="space-y-xs">{companies.data.map((item) => <li key={item.id}>
                    <button type="button" disabled={creating || editPending} aria-expanded={companyId === item.id} onClick={() => { operation.current++; setInvitationLink(null); setCopyStatus(''); setCompanyError(''); setEditError(''); setEditStatus(''); setCompany(null); setCompanyId(item.id === companyId ? null : item.id); }} className="text-primary underline cursor-pointer disabled:opacity-50">{item.name}</button>
                    {item.slug && <span className="text-on-surface-variant"> · {item.slug}</span>}
                  </li>)}</ul>}
                  <nav aria-label="Páginas de empresas" className="flex items-center gap-md">
                    <button type="button" disabled={creating || editPending || page <= 1} onClick={() => { operation.current++; setInvitationLink(null); setCopyStatus(''); setEditError(''); setEditStatus(''); setCompanyId(null); setCompany(null); setCompanies(null); setPage(page - 1); }} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer disabled:opacity-50">Anterior</button>
                    <span>Página {page} · {companies.total} empresas</span>
                    <button type="button" disabled={creating || editPending || page * companies.limit >= companies.total} onClick={() => { operation.current++; setInvitationLink(null); setCopyStatus(''); setEditError(''); setEditStatus(''); setCompanyId(null); setCompany(null); setCompanies(null); setPage(page + 1); }} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer disabled:opacity-50">Siguiente</button>
                  </nav>
                </>}
                {companyId !== null && !company && !companyError && <p role="status">Cargando detalle…</p>}
                {companyId !== null && company && <section aria-label={`Detalle de ${company.name}`} className="border-t border-outline-variant pt-md">
                  <h3 className="font-semibold">{company.name}</h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-md gap-y-xs">
                    <dt>ID</dt><dd>{company.id}</dd>
                    <dt>Slug</dt><dd>{company.slug ?? '—'}</dd>
                    <dt>Razón social</dt><dd>{company.legalName ?? '—'}</dd>
                    <dt>Moneda</dt><dd>{company.currency}</dd>
                    <dt>Zona horaria</dt><dd>{company.timezone ?? '—'}</dd>
                    <dt>Creada</dt><dd>{new Date(company.createdAt).toLocaleDateString('es-AR')}</dd>
                  </dl>
                  <form onSubmit={(event) => void saveCompany(event)} className="mt-md space-y-sm max-w-md">
                    <h4 className="font-semibold">Editar empresa</h4>
                    <label className="block">Nombre
                      <input required minLength={2} maxLength={120} value={editCompany.name} onChange={(event) => setEditCompany((value) => ({ ...value, name: event.target.value }))} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
                    </label>
                    <label className="block">Razón social (opcional)
                      <input maxLength={200} value={editCompany.legalName} onChange={(event) => setEditCompany((value) => ({ ...value, legalName: event.target.value }))} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
                    </label>
                    <label className="block">Zona horaria IANA (opcional)
                      <input maxLength={50} placeholder="America/Argentina/Buenos_Aires" value={editCompany.timezone} onChange={(event) => setEditCompany((value) => ({ ...value, timezone: event.target.value }))} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
                    </label>
                    {editError && <p role="alert" className="text-error">{editError}</p>}
                    {editStatus && <p role="status">{editStatus}</p>}
                    <button type="submit" disabled={editPending || creating} className="rounded-lg bg-primary px-md py-sm text-on-primary cursor-pointer disabled:opacity-50">{editPending ? 'Guardando…' : 'Guardar cambios'}</button>
                  </form>
                </section>}
              </section>
            </>}
          </main>
        )}
      </div>
    </div>
  );
}
