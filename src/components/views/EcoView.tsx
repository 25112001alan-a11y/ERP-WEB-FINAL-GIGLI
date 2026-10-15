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
  planBreakdown: { planCode: string; planName: string; priceMonthly: number | string; activeCount: number; mrrUsd: number }[];
  pastDueCompanies: { id: number; name: string; slug: string | null; planCode: string; planName: string }[];
  recentEvents: { eventId: string; topic: string; createdAt: string }[];
  unsubscribedCompanies: { id: number; name: string; slug: string | null }[];
}

interface CompanySummary { id: number; name: string; slug: string | null; currency: string }
interface CompanySubscriptionInfo {
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan: { code: string; name: string; priceMonthly: number | string };
}
interface CompanyDetail extends CompanySummary {
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  province: string | null;
  postalCode: string | null;
  taxCondition: string | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
  subscription: CompanySubscriptionInfo | null;
}
interface CompanyPage { data: CompanySummary[]; page: number; limit: number; total: number }
interface AuditEvent { id: number; action: string; createdAt: string; platformUser: { email: string } }
interface AuditFeedEvent extends AuditEvent { targetCompany: { id: number; name: string; slug: string | null } }
interface AuditPage { data: AuditFeedEvent[]; page: number; limit: number; total: number }
interface NewCompany { companyName: string; firstName: string; lastName: string; email: string; currency: string }
interface CompanyEdit {
  name: string; legalName: string; taxId: string; address: string;
  province: string; postalCode: string; taxCondition: string; timezone: string;
}
const emptyCompany: NewCompany = { companyName: '', firstName: '', lastName: '', email: '', currency: 'ARS' };
const emptyEdit: CompanyEdit = { name: '', legalName: '', taxId: '', address: '', province: '', postalCode: '', taxCondition: '', timezone: '' };
const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: 'Activa', past_due: 'Vencida', canceled: 'Cancelada', pending: 'Pendiente',
};
const subscriptionStatusLabel = (status: string) => SUBSCRIPTION_STATUS_LABELS[status] ?? status;

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
  const [queryInput, setQueryInput] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [companyError, setCompanyError] = useState('');
  const [companyPending, setCompanyPending] = useState(false);
  const [editCompany, setEditCompany] = useState<CompanyEdit>(emptyEdit);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [subForm, setSubForm] = useState({ planCode: 'free', status: 'active', cancelAtPeriodEnd: false });
  const [subPending, setSubPending] = useState(false);
  const [subError, setSubError] = useState('');
  const [subStatus, setSubStatus] = useState('');
  const [plans, setPlans] = useState<{ code: string; name: string }[]>([]);
  const [companyAudit, setCompanyAudit] = useState<AuditEvent[] | null>(null);
  const [companyAuditPending, setCompanyAuditPending] = useState(false);
  const [companyAuditError, setCompanyAuditError] = useState('');
  const [auditFeed, setAuditFeed] = useState<AuditPage | null>(null);
  const [auditFeedPending, setAuditFeedPending] = useState(false);
  const [auditFeedError, setAuditFeedError] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [newCompany, setNewCompany] = useState<NewCompany>(emptyCompany);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const operation = useRef(0);
  const createInFlight = useRef(false);

  const changeList = (next: Partial<{ page: number; q: string; statusFilter: string; planFilter: string }>) => {
    operation.current++;
    setInvitationLink(null);
    setCopyStatus('');
    setEditError('');
    setEditStatus('');
    setCompanyId(null);
    setCompany(null);
    setCompanies(null);
    if (next.page !== undefined) setPage(next.page); else setPage(1);
    if (next.q !== undefined) setQ(next.q);
    if (next.statusFilter !== undefined) setStatusFilter(next.statusFilter);
    if (next.planFilter !== undefined) setPlanFilter(next.planFilter);
  };

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
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set('q', q);
    if (statusFilter) params.set('status', statusFilter);
    if (planFilter) params.set('plan', planFilter);
    platformFetch<CompanyPage>(`/api/platform/companies?${params.toString()}`, token)
      .then((data) => { if (!cancelled) setCompanies(data); })
      .catch((err: unknown) => {
        if (!cancelled) {
          if (!localStorage.getItem(PLATFORM_TOKEN_KEY)) setToken(null);
          setCompanyError(err instanceof Error ? err.message : 'No se pudieron cargar las empresas.');
        }
      })
      .finally(() => { if (!cancelled) setCompanyPending(false); });
    return () => { cancelled = true; };
  }, [token, page, retry, q, statusFilter, planFilter]);

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
    if (company) {
      setEditCompany({
        name: company.name, legalName: company.legalName ?? '', taxId: company.taxId ?? '',
        address: company.address ?? '', province: company.province ?? '', postalCode: company.postalCode ?? '',
        taxCondition: company.taxCondition ?? '', timezone: company.timezone ?? '',
      });
      setSubForm({
        planCode: company.subscription?.plan.code ?? 'free',
        status: company.subscription?.status ?? 'active',
        cancelAtPeriodEnd: company.subscription?.cancelAtPeriodEnd ?? false,
      });
    }
  }, [company]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    platformFetch<{ code: string; name: string }[]>('/api/billing/plans')
      .then((data) => { if (!cancelled) setPlans(data); })
      .catch(() => { if (!cancelled) setPlans([]); });
    return () => { cancelled = true; };
  }, [token, retry]);

  useEffect(() => {
    if (!token || companyId === null) return;
    let cancelled = false;
    setCompanyAudit(null);
    setCompanyAuditPending(true);
    setCompanyAuditError('');
    platformFetch<{ data: AuditEvent[] }>(`/api/platform/companies/${companyId}/audit`, token)
      .then((data) => { if (!cancelled) setCompanyAudit(data.data); })
      .catch((err: unknown) => { if (!cancelled) setCompanyAuditError(err instanceof Error ? err.message : 'No se pudo cargar la auditoría.'); })
      .finally(() => { if (!cancelled) setCompanyAuditPending(false); });
    return () => { cancelled = true; };
  }, [token, companyId, retry]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setAuditFeedPending(true);
    setAuditFeedError('');
    platformFetch<AuditPage>(`/api/platform/audit?page=${auditPage}`, token)
      .then((data) => { if (!cancelled) setAuditFeed(data); })
      .catch((err: unknown) => { if (!cancelled) setAuditFeedError(err instanceof Error ? err.message : 'No se pudo cargar la auditoría.'); })
      .finally(() => { if (!cancelled) setAuditFeedPending(false); });
    return () => { cancelled = true; };
  }, [token, auditPage, retry]);

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
      setQueryInput('');
      setQ('');
      setStatusFilter('');
      setPlanFilter('');
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
    setQueryInput('');
    setQ('');
    setStatusFilter('');
    setPlanFilter('');
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
    const norm = (value: string) => value.trim() || null;
    const payload = {
      name: editCompany.name.trim(),
      legalName: norm(editCompany.legalName),
      taxId: norm(editCompany.taxId),
      address: norm(editCompany.address),
      province: norm(editCompany.province),
      postalCode: norm(editCompany.postalCode),
      taxCondition: norm(editCompany.taxCondition),
      timezone: norm(editCompany.timezone),
    };
    setEditError('');
    setEditStatus('');
    if (
      payload.name === company.name &&
      payload.legalName === company.legalName &&
      payload.taxId === company.taxId &&
      payload.address === company.address &&
      payload.province === company.province &&
      payload.postalCode === company.postalCode &&
      payload.taxCondition === company.taxCondition &&
      payload.timezone === company.timezone
    ) {
      setEditStatus('No hay cambios para guardar.');
      return;
    }
    const attempt = operation.current;
    setEditPending(true);
    try {
      const updated = await platformFetch<CompanyDetail>(`/api/platform/companies/${company.id}`, token, payload, 'PATCH');
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

  const saveSubscription = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !company || subPending || editPending || creating) return;
    setSubError('');
    setSubStatus('');
    const attempt = operation.current;
    setSubPending(true);
    try {
      const updated = await platformFetch<CompanySubscriptionInfo>(`/api/platform/companies/${company.id}/subscription`, token, {
        planCode: subForm.planCode,
        status: subForm.status,
        cancelAtPeriodEnd: subForm.cancelAtPeriodEnd,
      }, 'PATCH');
      if (attempt !== operation.current || localStorage.getItem(PLATFORM_TOKEN_KEY) !== token) return;
      setCompany((value) => (value ? { ...value, subscription: updated } : value));
      setSubStatus('Suscripción actualizada.');
      setRetry((value) => value + 1);
    } catch (err) {
      if (attempt !== operation.current) return;
      if (!localStorage.getItem(PLATFORM_TOKEN_KEY)) setToken(null);
      setSubError(err instanceof Error ? err.message : 'No se pudo actualizar la suscripción.');
    } finally {
      if (attempt === operation.current) setSubPending(false);
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
          <form onSubmit={(event) => void login(event)} className="max-w-[28rem] space-y-md rounded-xl bg-surface-container-lowest p-lg shadow-sm">
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
              <section aria-label="Distribución por plan" className="rounded-xl bg-surface-container-lowest p-md shadow-sm space-y-sm">
                <h2 className="text-lg font-semibold">Distribución por plan</h2>
                {overview.planBreakdown.length === 0 ? <p>Sin planes asignados.</p> : (
                  <table className="w-full text-left">
                    <thead><tr><th>Plan</th><th>Precio</th><th>Empresas activas</th><th>MRR</th></tr></thead>
                    <tbody>{overview.planBreakdown.map((plan) => <tr key={plan.planCode}>
                      <td>{plan.planName} ({plan.planCode})</td>
                      <td>{formatMoney(plan.priceMonthly, 'USD')}</td>
                      <td>{plan.activeCount}</td>
                      <td>{formatMoney(plan.mrrUsd, 'USD')}</td>
                    </tr>)}</tbody>
                  </table>
                )}
              </section>
              <section aria-label="Empresas vencidas" className="rounded-xl bg-surface-container-lowest p-md shadow-sm space-y-sm">
                <h2 className="text-lg font-semibold">Empresas vencidas (pago fallido)</h2>
                {overview.pastDueCompanies.length === 0 ? <p>Sin empresas vencidas.</p> : <ul className="list-disc pl-lg">{overview.pastDueCompanies.map((company) => <li key={company.id}>{company.name}{company.slug ? ` (${company.slug})` : ''} · {company.planName}</li>)}</ul>}
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
                <form onSubmit={(event) => { event.preventDefault(); changeList({ q: queryInput.trim() }); }} className="flex flex-wrap items-end gap-sm">
                  <label className="block">Buscar
                    <input type="text" maxLength={120} placeholder="Nombre o slug" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} className="mt-xs block rounded-lg border border-outline-variant p-sm bg-surface" />
                  </label>
                  <label className="block">Estado
                    <select value={statusFilter} onChange={(event) => changeList({ statusFilter: event.target.value })} className="mt-xs block rounded-lg border border-outline-variant p-sm bg-surface">
                      <option value="">Todos</option>
                      {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="block">Plan
                    <select value={planFilter} onChange={(event) => changeList({ planFilter: event.target.value })} className="mt-xs block rounded-lg border border-outline-variant p-sm bg-surface">
                      <option value="">Todos</option>
                      {plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
                    </select>
                  </label>
                  <button type="submit" className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer">Buscar</button>
                  {(q || statusFilter || planFilter || queryInput) && <button type="button" onClick={() => { setQueryInput(''); changeList({ q: '', statusFilter: '', planFilter: '' }); }} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer">Limpiar</button>}
                </form>
                {companyPending && <p role="status">Cargando empresas…</p>}
                {companyError && <div role="alert"><p className="text-error">{companyError}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer">Reintentar</button></div>}
                {!companyPending && companies && <>
                  {companies.data.length === 0 ? <p>No hay empresas en esta página.</p> : <ul className="space-y-xs">{companies.data.map((item) => <li key={item.id}>
                    <button type="button" disabled={creating || editPending} aria-expanded={companyId === item.id} onClick={() => { operation.current++; setInvitationLink(null); setCopyStatus(''); setCompanyError(''); setEditError(''); setEditStatus(''); setCompany(null); setCompanyId(item.id === companyId ? null : item.id); }} className="text-primary underline cursor-pointer disabled:opacity-50">{item.name}</button>
                    {item.slug && <span className="text-on-surface-variant"> · {item.slug}</span>}
                  </li>)}</ul>}
                  <nav aria-label="Páginas de empresas" className="flex items-center gap-md">
                    <button type="button" disabled={creating || editPending || page <= 1} onClick={() => changeList({ page: page - 1 })} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer disabled:opacity-50">Anterior</button>
                    <span>Página {page} · {companies.total} empresas</span>
                    <button type="button" disabled={creating || editPending || page * companies.limit >= companies.total} onClick={() => changeList({ page: page + 1 })} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer disabled:opacity-50">Siguiente</button>
                  </nav>
                </>}
                {companyId !== null && !company && !companyError && <p role="status">Cargando detalle…</p>}
                {companyId !== null && company && <section aria-label={`Detalle de ${company.name}`} className="border-t border-outline-variant pt-md space-y-md">
                  <h3 className="font-semibold">{company.name}</h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-md gap-y-xs">
                    <dt>ID</dt><dd>{company.id}</dd>
                    <dt>Slug</dt><dd>{company.slug ?? '—'}</dd>
                    <dt>Razón social</dt><dd>{company.legalName ?? '—'}</dd>
                    <dt>CUIT / ID fiscal</dt><dd>{company.taxId ?? '—'}</dd>
                    <dt>Dirección</dt><dd>{company.address ?? '—'}</dd>
                    <dt>Provincia</dt><dd>{company.province ?? '—'}</dd>
                    <dt>Código postal</dt><dd>{company.postalCode ?? '—'}</dd>
                    <dt>Condición fiscal</dt><dd>{company.taxCondition ?? '—'}</dd>
                    <dt>Moneda</dt><dd>{company.currency}</dd>
                    <dt>Zona horaria</dt><dd>{company.timezone ?? '—'}</dd>
                    <dt>Creada</dt><dd>{new Date(company.createdAt).toLocaleDateString('es-AR')}</dd>
                    <dt>Actualizada</dt><dd>{new Date(company.updatedAt).toLocaleDateString('es-AR')}</dd>
                  </dl>
                  <section aria-label="Suscripción" className="rounded-lg border border-outline-variant p-md">
                    <h4 className="font-semibold">Suscripción</h4>
                    {company.subscription ? <dl className="mt-xs grid grid-cols-[auto_1fr] gap-x-md gap-y-xs">
                      <dt>Plan</dt><dd>{company.subscription.plan.name} ({company.subscription.plan.code})</dd>
                      <dt>Precio mensual</dt><dd>{formatMoney(company.subscription.plan.priceMonthly, 'USD')}</dd>
                      <dt>Estado</dt><dd>{subscriptionStatusLabel(company.subscription.status)}</dd>
                      <dt>Inicio del período</dt><dd>{company.subscription.currentPeriodStart ? new Date(company.subscription.currentPeriodStart).toLocaleDateString('es-AR') : '—'}</dd>
                      <dt>Fin del período</dt><dd>{company.subscription.currentPeriodEnd ? new Date(company.subscription.currentPeriodEnd).toLocaleDateString('es-AR') : '—'}</dd>
                      <dt>Cancelación al cierre</dt><dd>{company.subscription.cancelAtPeriodEnd ? 'Sí' : 'No'}</dd>
                    </dl> : <p className="mt-xs">Sin suscripción registrada (plan Free implícito).</p>}
                    <form onSubmit={(event) => void saveSubscription(event)} className="mt-md space-y-sm max-w-[24rem]">
                      <h5 className="font-semibold">{company.subscription ? 'Cambiar plan y estado' : 'Asignar plan y estado'}</h5>
                      <label className="block">Plan
                        <select value={subForm.planCode} onChange={(event) => setSubForm((value) => ({ ...value, planCode: event.target.value }))} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface">
                          {(plans.length > 0 ? plans : [{ code: subForm.planCode, name: subForm.planCode }]).map((plan) => <option key={plan.code} value={plan.code}>{plan.name} ({plan.code})</option>)}
                        </select>
                      </label>
                      <label className="block">Estado
                        <select value={subForm.status} onChange={(event) => setSubForm((value) => ({ ...value, status: event.target.value }))} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface">
                          {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label className="flex items-center gap-sm">
                        <input type="checkbox" checked={subForm.cancelAtPeriodEnd} onChange={(event) => setSubForm((value) => ({ ...value, cancelAtPeriodEnd: event.target.checked }))} />
                        Cancelar al cierre del período
                      </label>
                      {subError && <p role="alert" className="text-error">{subError}</p>}
                      {subStatus && <p role="status">{subStatus}</p>}
                      <button type="submit" disabled={subPending || editPending || creating} className="rounded-lg bg-primary px-md py-sm text-on-primary cursor-pointer disabled:opacity-50">{subPending ? 'Guardando…' : 'Guardar suscripción'}</button>
                    </form>
                  </section>
                  <form onSubmit={(event) => void saveCompany(event)} className="space-y-sm max-w-[36rem]">
                    <h4 className="font-semibold">Editar empresa</h4>
                    {([
                      ['name', 'Nombre', 120, true],
                      ['legalName', 'Razón social (opcional)', 200, false],
                      ['taxId', 'CUIT / ID fiscal (opcional)', 50, false],
                      ['address', 'Dirección (opcional)', 200, false],
                      ['province', 'Provincia (opcional)', 100, false],
                      ['postalCode', 'Código postal (opcional)', 20, false],
                      ['taxCondition', 'Condición fiscal (opcional)', 40, false],
                    ] as const).map(([key, label, maxLength, required]) => (
                      <label key={key} className="block">{label}
                        <input required={required} minLength={required ? 2 : undefined} maxLength={maxLength} value={editCompany[key]} onChange={(event) => setEditCompany((value) => ({ ...value, [key]: event.target.value }))} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
                      </label>
                    ))}
                    <label className="block">Zona horaria IANA (opcional)
                      <input maxLength={50} placeholder="America/Argentina/Buenos_Aires" value={editCompany.timezone} onChange={(event) => setEditCompany((value) => ({ ...value, timezone: event.target.value }))} className="mt-xs block w-full rounded-lg border border-outline-variant p-sm bg-surface" />
                    </label>
                    {editError && <p role="alert" className="text-error">{editError}</p>}
                    {editStatus && <p role="status">{editStatus}</p>}
                    <button type="submit" disabled={editPending || creating} className="rounded-lg bg-primary px-md py-sm text-on-primary cursor-pointer disabled:opacity-50">{editPending ? 'Guardando…' : 'Guardar cambios'}</button>
                  </form>
                  <div>
                    <h4 className="font-semibold">Auditoría de la empresa</h4>
                    {companyAuditPending && <p role="status">Cargando auditoría…</p>}
                    {companyAuditError && <p role="alert" className="text-error">{companyAuditError}</p>}
                    {companyAudit && (companyAudit.length === 0
                      ? <p>Sin eventos de plataforma registrados.</p>
                      : <ul className="space-y-xs">{companyAudit.map((event) => <li key={event.id}>{event.action} · {event.platformUser.email} · {new Date(event.createdAt).toLocaleString('es-AR')}</li>)}</ul>)}
                  </div>
                </section>}
              </section>
              <section aria-label="Auditoría de plataforma" className="rounded-xl bg-surface-container-lowest p-md shadow-sm space-y-sm">
                <h2 className="text-lg font-semibold">Auditoría de plataforma</h2>
                {auditFeedPending && <p role="status">Cargando auditoría…</p>}
                {auditFeedError && <div role="alert"><p className="text-error">{auditFeedError}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer">Reintentar</button></div>}
                {!auditFeedPending && auditFeed && <>
                  {auditFeed.data.length === 0 ? <p>Sin eventos registrados.</p> : <ul className="space-y-xs">{auditFeed.data.map((event) => <li key={event.id}>{event.action} · {event.targetCompany.name} · {event.platformUser.email} · {new Date(event.createdAt).toLocaleString('es-AR')}</li>)}</ul>}
                  <nav aria-label="Páginas de auditoría" className="flex items-center gap-md">
                    <button type="button" disabled={auditPage <= 1} onClick={() => setAuditPage(auditPage - 1)} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer disabled:opacity-50">Anterior</button>
                    <span>Página {auditFeed.page} · {auditFeed.total} eventos</span>
                    <button type="button" disabled={auditPage * auditFeed.limit >= auditFeed.total} onClick={() => setAuditPage(auditPage + 1)} className="rounded-lg border border-outline-variant px-md py-sm cursor-pointer disabled:opacity-50">Siguiente</button>
                  </nav>
                </>}
              </section>
            </>}
          </main>
        )}
      </div>
    </div>
  );
}
