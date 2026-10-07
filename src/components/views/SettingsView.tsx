import React, { useEffect, useState } from 'react';
import { ViewPath, TaxRate, BillingPlan, BillingSubscription, WarehouseOption, SalePointOption } from '../../types';
import { apiFetch } from '../../lib/api';
import { deriveBranches } from '../../lib/branch';
import { useAuth } from '../../lib/auth';

interface SettingsViewProps {
  taxes: TaxRate[];
  onAddTax: (name: string, rate: number) => Promise<void>;
  onToggleTax: (id: number, active: boolean) => Promise<void>;
  warehouses: WarehouseOption[];
  onSetBranchDefaultWarehouse: (branchId: number, warehouseId: number | null) => Promise<void>;
  salePoints: SalePointOption[];
  onAddSalePoint: (branchId: number, number: number, name?: string) => Promise<void>;
  onDeleteSalePoint: (id: number) => Promise<void>;
  onNavigate: (view: ViewPath) => void;
}

interface CompanyProfile {
  id: number;
  name: string;
  slug: string | null;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  province: string | null;
  postalCode: string | null;
  taxCondition: string | null;
  currency: string | null;
  timezone: string | null;
}

const CURRENCY_LABELS: Record<string, string> = {
  USD: 'USD ($) - Dólar Estadounidense',
  ARS: 'ARS ($) - Peso Argentino',
  UYU: 'UYU ($) - Peso Uruguayo',
  CLP: 'CLP ($) - Peso Chileno',
  EUR: 'EUR (€) - Euro',
  MXN: 'MXN ($) - Peso Mexicano',
};

const TIMEZONE_LABELS: Record<string, string> = {
  'America/Argentina/Buenos_Aires': 'America/Argentina/Buenos_Aires (UTC-3)',
  'America/Santiago': 'America/Santiago (UTC-3)',
  'America/Mexico_City': 'America/Mexico_City (UTC-6)',
  'Europe/Madrid': 'Europe/Madrid (UTC+1)',
};

export const SettingsView: React.FC<SettingsViewProps> = ({ taxes, onAddTax, onToggleTax, warehouses, onSetBranchDefaultWarehouse, salePoints, onAddSalePoint, onDeleteSalePoint, onNavigate }) => {
  const { refreshMe } = useAuth();
  const [activeTab, setActiveTab] = useState<'empresa' | 'impuestos' | 'plan' | 'sucursales' | 'puntos-venta'>('empresa');

  // Company state (backed by GET/PATCH /api/company)
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyError, setCompanyError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [taxCondition, setTaxCondition] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');
  const [savedMsg, setSavedMsg] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);

  // Billing state (backed by GET /api/billing/subscription + plans)
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  // Tax form state
  const [taxName, setTaxName] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [taxError, setTaxError] = useState('');

  // Branch default warehouse state
  const [branchSaving, setBranchSaving] = useState(false);
  const [branchMsg, setBranchMsg] = useState<string | null>(null);

  // Sale point (PV) state
  const [pvBranchId, setPvBranchId] = useState('');
  const [pvNumber, setPvNumber] = useState('');
  const [pvName, setPvName] = useState('');
  const [pvSaving, setPvSaving] = useState(false);
  const [pvMsg, setPvMsg] = useState<string | null>(null);

  const handleAddSalePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pvBranchId || !pvNumber) return;
    setPvSaving(true);
    setPvMsg(null);
    try {
      await onAddSalePoint(Number(pvBranchId), Number(pvNumber), pvName.trim() || undefined);
      setPvNumber('');
      setPvName('');
      setPvMsg('Punto de venta agregado.');
    } catch {
      setPvMsg('No se pudo agregar el punto de venta.');
    } finally {
      setPvSaving(false);
    }
  };

  const handleDeleteSalePoint = async (id: number) => {
    setPvSaving(true);
    setPvMsg(null);
    try {
      await onDeleteSalePoint(id);
      setPvMsg('Punto de venta eliminado.');
    } catch {
      setPvMsg('No se pudo eliminar el punto de venta.');
    } finally {
      setPvSaving(false);
    }
  };

  const handleBranchDefaultChange = async (branchId: number, value: string) => {
    setBranchSaving(true);
    setBranchMsg(null);
    try {
      await onSetBranchDefaultWarehouse(branchId, value === '' ? null : Number(value));
      setBranchMsg('Depósito por defecto actualizado.');
    } catch (err) {
      setBranchMsg(err instanceof Error ? err.message : 'No se pudo actualizar el depósito por defecto.');
    } finally {
      setBranchSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    apiFetch<CompanyProfile>('/api/company')
      .then((c) => {
        if (cancelled) return;
        setCompany(c);
        setCompanyName(c.name ?? '');
        setCompanySlug(c.slug ?? '');
        setLegalName(c.legalName ?? '');
        setTaxId(c.taxId ?? '');
        setAddress(c.address ?? '');
        setProvince(c.province ?? '');
        setPostalCode(c.postalCode ?? '');
        setTaxCondition(c.taxCondition ?? '');
        setCurrency(c.currency ?? 'USD');
        setTimezone(c.timezone ?? 'America/Argentina/Buenos_Aires');
      })
      .catch(() => {
        if (!cancelled) setCompanyError('No se pudo cargar el perfil de la empresa.');
      })
      .finally(() => {
        if (!cancelled) setCompanyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Billing: current subscription + available plans.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<BillingSubscription>('/api/billing/subscription'),
      apiFetch<BillingPlan[]>('/api/billing/plans'),
    ])
      .then(([sub, catalog]) => {
        if (cancelled) return;
        setSubscription(sub);
        setPlans(catalog);
      })
      .catch(() => {
        if (!cancelled) setBillingError('No se pudo cargar la información del plan.');
      })
      .finally(() => {
        if (!cancelled) setBillingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpgrade = async (planCode: string) => {
    setCheckoutError('');
    setCheckoutBusy(true);
    try {
      const { checkoutUrl } = await apiFetch<{ checkoutUrl: string }>('/api/billing/checkout', {
        method: 'POST',
        body: { planCode },
      });
      // Redirect to the Mercado Pago payment flow.
      window.location.href = checkoutUrl;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'No se pudo iniciar el proceso de pago.');
      setCheckoutBusy(false);
    }
  };

  const PLAN_STATUS_LABELS: Record<string, string> = {
    active: 'Activa',
    past_due: 'Vencida',
    canceled: 'Cancelada',
    pending: 'Pendiente de pago',
  };

  const formatPeriod = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompanyError('');
    try {
      const updated = await apiFetch<CompanyProfile>('/api/company', {
        method: 'PATCH',
        body: {
          name: companyName.trim(),
          slug: companySlug.trim(),
          legalName: legalName.trim() || null,
          taxId: taxId.trim() || null,
          address: address.trim() || null,
          province: province.trim() || null,
          postalCode: postalCode.trim() || null,
          taxCondition: taxCondition.trim() || null,
          currency,
          timezone,
        },
      });
      setCompany(updated);
      // Keep the session's company (storefront slug) in sync with the profile.
      await refreshMe().catch(() => undefined);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : 'No se pudo guardar el perfil de la empresa.');
    }
  };

  const handleAddTax = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taxName.trim() || taxRate === '') return;
    try {
      await onAddTax(taxName.trim(), Number(taxRate));
      setTaxName('');
      setTaxRate('');
    } catch (err) {
      setTaxError(err instanceof Error ? err.message : 'No se pudo crear el impuesto');
    }
  };

  return (
    <div className="flex flex-col w-full h-full gap-lg font-body-md text-on-surface">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-md bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
        <div>
          <span className="font-label-md text-label-md text-primary tracking-widest uppercase">Parámetros del Sistema</span>
          <h1 className="font-display-lg text-display-lg text-on-surface">Configuración Global ERP</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Gestión de datos de la empresa, impuestos y monedas.</p>
        </div>
        <div className="flex gap-md">
          <button
            onClick={() => onNavigate('administracion')}
            className="px-md py-sm bg-surface-container-high text-on-surface font-label-md text-label-md rounded-lg shadow-sm hover:bg-surface-container-highest transition-colors flex items-center gap-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
            Ir a Administración
          </button>
        </div>
      </div>

      {/* Tabs Layout */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 overflow-hidden flex flex-col flex-1">
        <div className="flex border-b border-outline-variant/20 bg-surface-container-low px-lg pt-sm gap-md overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('empresa')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'empresa' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Datos de la Empresa
          </button>
          <button
            onClick={() => setActiveTab('impuestos')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'impuestos' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Impuestos y Monedas
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'plan' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Plan y Facturación
          </button>
          <button
            onClick={() => setActiveTab('sucursales')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'sucursales' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Sucursales
          </button>
          <button
            onClick={() => setActiveTab('puntos-venta')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'puntos-venta' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Puntos de venta
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-lg flex-1 overflow-auto">
          {savedMsg && (
            <div className="mb-md p-sm bg-tertiary-container text-on-tertiary-container rounded-lg font-label-md text-sm flex items-center gap-xs animate-fade-in">
              <span className="material-symbols-outlined text-[18px]">check_circle</span> Configuración guardada exitosamente.
            </div>
          )}

          {activeTab === 'empresa' && (
            <form onSubmit={handleSaveCompany} className="max-w-[672px] space-y-md">
              {companyError && (
                <p className="text-sm text-on-error-container bg-error-container/20 rounded-lg p-sm">{companyError}</p>
              )}
              {companyLoading ? (
                <div className="flex items-center gap-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  Cargando perfil de la empresa...
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md uppercase text-on-surface-variant">Razón Social / Empresa *</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md uppercase text-on-surface-variant">Slug del Storefront</label>
                    <div className="flex items-center gap-xs">
                      <span className="font-mono-sm text-on-surface-variant">{window.location.origin}/t/</span>
                      <input
                        type="text"
                        value={companySlug}
                        onChange={(e) => setCompanySlug(e.target.value)}
                        placeholder="mi-empresa"
                        className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-mono-sm flex-1"
                      />
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      Identificador público de tu tienda. Solo minúsculas, números y guiones; debe ser único.
                    </p>
                    {companySlug.trim() && (
                      <div className="flex flex-wrap items-center gap-sm mt-xs">
                        <a
                          href={`${window.location.origin}/t/${companySlug.trim()}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-md py-xs bg-secondary-container text-on-secondary-container font-label-md text-label-md rounded-lg hover:opacity-90 transition-opacity flex items-center gap-xs"
                        >
                          <span className="material-symbols-outlined text-[18px]">storefront</span>
                          Ver mi tienda pública
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}/t/${companySlug.trim()}`;
                            navigator.clipboard?.writeText(url).then(
                              () => {
                                setCopiedMsg(true);
                                setTimeout(() => setCopiedMsg(false), 2000);
                              },
                              () => setCompanyError('No se pudo copiar el enlace. Copialo manualmente desde la barra del navegador.'),
                            );
                          }}
                          className="px-md py-xs border border-outline-variant/50 text-on-surface font-label-md text-label-md rounded-lg hover:bg-surface-container-low transition-colors flex items-center gap-xs cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[18px]">content_copy</span>
                          {copiedMsg ? '¡Enlace copiado!' : 'Copiar enlace'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md uppercase text-on-surface-variant">Nombre Legal</label>
                    <input
                      type="text"
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                      className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
                    />
                  </div>

                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md uppercase text-on-surface-variant">Identificación Fiscal (RUT / Tax ID)</label>
                    <input
                      type="text"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-mono-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                    <div className="flex flex-col gap-xs">
                      <label className="font-label-md text-label-md uppercase text-on-surface-variant">Domicilio Fiscal</label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
                      />
                    </div>

                    <div className="flex flex-col gap-xs">
                      <label className="font-label-md text-label-md uppercase text-on-surface-variant">Provincia</label>
                      <input
                        type="text"
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
                      />
                    </div>

                    <div className="flex flex-col gap-xs">
                      <label className="font-label-md text-label-md uppercase text-on-surface-variant">Código Postal</label>
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-mono-sm"
                      />
                    </div>

                    <div className="flex flex-col gap-xs">
                      <label className="font-label-md text-label-md uppercase text-on-surface-variant">Condición frente al IVA</label>
                      <input
                        type="text"
                        value={taxCondition}
                        onChange={(e) => setTaxCondition(e.target.value)}
                        className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                    <div className="flex flex-col gap-xs">
                      <label className="font-label-md text-label-md uppercase text-on-surface-variant">Moneda Principal</label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none cursor-pointer"
                      >
                        {Object.entries(CURRENCY_LABELS).map(([code, label]) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-xs">
                      <label className="font-label-md text-label-md uppercase text-on-surface-variant">Zona Horaria</label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none cursor-pointer"
                      >
                        {Object.entries(TIMEZONE_LABELS).map(([code, label]) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="px-lg py-sm bg-primary text-on-primary font-label-md text-label-md rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  >
                    Guardar Cambios
                  </button>
                </>
              )}
              {!companyLoading && company && (
                <p className="text-xs text-on-surface-variant font-mono-sm">ID de empresa: {company.id}</p>
              )}
            </form>
          )}

          {activeTab === 'impuestos' && (
            <div className="space-y-md max-w-[672px]">
              <h3 className="font-headline-md text-headline-md text-on-surface">Tasas de Impuesto</h3>
              <div className="space-y-sm">
                {taxes.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-md bg-surface-container-low rounded-lg border border-outline-variant/30 flex-wrap gap-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface">{t.name}</p>
                      <p className="text-xs text-on-surface-variant">{t.active ? 'Tasa activa' : 'Desactivada'}</p>
                    </div>
                    <div className="flex items-center gap-md shrink-0">
                      <span className="font-mono-sm font-bold text-primary text-headline-md">{Number(t.rate).toFixed(1)}%</span>
                      {t.companyId == null ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-surface-container-high text-on-surface-variant">
                          Sistema
                        </span>
                      ) : (
                        <button
                          onClick={() => onToggleTax(t.id, !t.active)}
                          className={`px-2 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                            t.active ? 'bg-tertiary-container/20 text-on-tertiary-container' : 'bg-surface-container-high text-on-surface-variant'
                          }`}
                        >
                          {t.active ? 'Activa' : 'Inactiva'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {taxes.length === 0 && (
                  <p className="text-on-surface-variant text-sm">No hay tasas de impuesto configuradas.</p>
                )}
              </div>

              <form onSubmit={handleAddTax} className="flex flex-wrap items-end gap-md p-md rounded-xl border border-outline-variant/30 bg-surface-container-low max-w-[576px]">
                <div className="flex flex-col gap-xs flex-1 min-w-40">
                  <label className="font-label-md text-label-md uppercase text-on-surface-variant">Nueva Tasa</label>
                  <input
                    type="text"
                    value={taxName}
                    onChange={(e) => setTaxName(e.target.value)}
                    placeholder="Ej. IVA 22%"
                    className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
                  />
                </div>
                <div className="flex flex-col gap-xs w-28">
                  <label className="font-label-md text-label-md uppercase text-on-surface-variant">Porcentaje</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      placeholder="19.0"
                      className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-mono-sm w-full"
                    />
                    <span className="text-on-surface-variant">%</span>
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-lg py-sm bg-primary text-on-primary font-label-md text-label-md rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                >
                  Agregar
                </button>
              </form>
              {taxError && (
                <p className="text-sm text-on-error-container bg-error-container/20 rounded-lg p-sm">{taxError}</p>
              )}
            </div>
          )}
{activeTab === 'sucursales' && (
                <div className="space-y-md max-w-[672px]">
                  <h3 className="font-headline-md text-headline-md text-on-surface">Sucursales</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    El depósito por defecto se precarga al recibir compras y despachar pedidos de la sucursal; queda editable en cada documento.
                  </p>
                  {branchMsg && (
                    <p className={`text-sm rounded-lg p-sm ${branchMsg.includes('actualizado') ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-error-container/20 text-on-error-container'}`}>
                      {branchMsg}
                    </p>
                  )}
                  {deriveBranches(warehouses).map((branch) => {
                    const branchWarehouses = warehouses.filter((w) => (w.branch?.id ?? w.branchId) === branch.id);
                    return (
                      <div key={branch.id} className="flex flex-col sm:flex-row sm:items-center gap-x-lg gap-y-sm border border-outline-variant/20 rounded-lg p-md">
                        <div className="flex-1">
                          <p className="font-label-md text-label-md text-on-surface">{branch.name}</p>
                          <p className="text-sm text-on-surface-variant">
                            {branchWarehouses.length} {branchWarehouses.length === 1 ? 'depósito' : 'depósitos'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-xs">
                          <label className="font-label-md text-label-md uppercase text-on-surface-variant" htmlFor={`branch-default-${branch.id}`}>
                            Depósito por defecto
                          </label>
                          <select
                            id={`branch-default-${branch.id}`}
                            value={String(branch.defaultWarehouseId ?? '')}
                            disabled={branchSaving}
                            onChange={(e) => void handleBranchDefaultChange(branch.id, e.target.value)}
                            className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none cursor-pointer disabled:opacity-50"
                          >
                            <option value="">Sin depósito por defecto</option>
                            {branchWarehouses.map((w) => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
{activeTab === 'puntos-venta' && (
                <div className="space-y-md max-w-[672px]">
                  <h3 className="font-headline-md text-headline-md text-on-surface">Puntos de venta</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    El punto de venta identifica fiscalmente la factura (0001-00000042): el número del PV pasa a ser su serie. Cada número es único por empresa.
                  </p>
                  {pvMsg && (
                    <p className={`text-sm rounded-lg p-sm ${pvMsg.includes('agregado') || pvMsg.includes('eliminado') ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-error-container/20 text-on-error-container'}`}>
                      {pvMsg}
                    </p>
                  )}
                  <form onSubmit={handleAddSalePoint} className="flex flex-col gap-xs border border-outline-variant/20 rounded-lg p-md">
                    <div className="flex flex-col gap-xs">
                      <label className="font-label-md text-label-md uppercase text-on-surface-variant" htmlFor="pv-branch">Sucursal</label>
                      <select
                        id="pv-branch"
                        value={pvBranchId}
                        disabled={pvSaving}
                        onChange={(e) => setPvBranchId(e.target.value)}
                        className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none cursor-pointer disabled:opacity-50"
                        required
                      >
                        <option value="">Seleccionar sucursal</option>
                        {deriveBranches(warehouses).map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-xs">
                      <div className="flex flex-col gap-xs">
                        <label className="font-label-md text-label-md uppercase text-on-surface-variant" htmlFor="pv-number">Nº de punto de venta *</label>
                        <input
                          id="pv-number"
                          type="number"
                          min={1}
                          value={pvNumber}
                          disabled={pvSaving}
                          onChange={(e) => setPvNumber(e.target.value)}
                          placeholder="4"
                          className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-mono-sm disabled:opacity-50"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-xs">
                        <label className="font-label-md text-label-md uppercase text-on-surface-variant" htmlFor="pv-name">Nombre</label>
                        <input
                          id="pv-name"
                          type="text"
                          maxLength={80}
                          value={pvName}
                          disabled={pvSaving}
                          onChange={(e) => setPvName(e.target.value)}
                          placeholder="Opcional — Ej: Mostrador"
                          className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary disabled:opacity-50"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={pvSaving}
                      className="self-start bg-primary text-on-primary px-md py-sm rounded-lg font-label-md text-label-md hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      Agregar punto de venta
                    </button>
                  </form>
                  <div className="flex flex-col gap-sm">
                    {salePoints.length === 0 ? (
                      <p className="text-sm text-on-surface-variant">Sin puntos de venta configurados. Agregá el primero para poder facturar con serie fiscal.</p>
                    ) : (
                      salePoints.map((sp) => (
                        <div key={sp.id} className="flex items-center gap-x-lg gap-y-sm border border-outline-variant/20 rounded-lg p-md">
                          <div className="flex-1">
                            <p className="font-label-md text-label-md text-on-surface">{sp.branch.name} — {String(sp.number).padStart(4, '0')}</p>
                            {sp.name && <p className="text-sm text-on-surface-variant">{sp.name}</p>}
                          </div>
                          <button
                            type="button"
                            disabled={pvSaving}
                            onClick={() => void handleDeleteSalePoint(sp.id)}
                            className="text-on-error-container bg-error-container/20 px-sm py-xs rounded-lg font-label-md text-label-md hover:opacity-90 disabled:opacity-50 cursor-pointer"
                          >
                            Eliminar
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
{activeTab === 'plan' && (
                <div className="space-y-md max-w-[672px]">
                  <h3 className="font-headline-md text-headline-md text-on-surface">Plan y Facturación</h3>

                  {billingLoading && (
                    <div className="flex items-center gap-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      Cargando plan...
                    </div>
                  )}
                  {billingError && (
                    <p className="text-sm text-on-error-container bg-error-container/20 rounded-lg p-sm">{billingError}</p>
                  )}

                  {!billingLoading && subscription && (
                    <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-md md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-label-md text-label-md uppercase text-on-surface-variant">Plan actual</p>
                        <p className="font-headline-md text-headline-md text-primary">
                          {subscription.plan.name}{' '}
                          <span className="text-on-surface-variant font-body-lg text-sm">
                            — USD {subscription.plan.priceMonthly}/mes
                          </span>
                        </p>
                        <p className="text-sm text-on-surface-variant">
                          Estado: {PLAN_STATUS_LABELS[subscription.status] ?? subscription.status}
                          <span className="mx-sm">·</span>
                          Período: {formatPeriod(subscription.currentPeriodStart)} al {formatPeriod(subscription.currentPeriodEnd)}
                        </p>
                      </div>
                    </div>
                  )}

                  {checkoutError && (
                    <p className="text-sm text-on-error-container bg-error-container/20 rounded-lg p-sm">{checkoutError}</p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                    {plans.map((p) => {
                      const isCurrent = subscription?.plan.code === p.code;
                      return (
                        <div
                          key={p.code}
                          className={`p-md rounded-xl border flex flex-col gap-sm ${
                            isCurrent ? 'border-primary bg-primary-container/10' : 'border-outline-variant/30 bg-surface-container-low'
                          }`}
                        >
                          <p className="font-label-md text-label-md uppercase text-on-surface-variant">{p.name}</p>
                          <p className="font-display-sm text-display-sm text-on-surface">
                            USD {p.priceMonthly}
                            <span className="text-xs text-on-surface-variant font-body-md"> /mes</span>
                          </p>
                          <p className="text-xs text-on-surface-variant leading-relaxed">{p.description}</p>
                          <ul className="space-y-1 text-xs text-on-surface-variant">
                            {p.features.map((f) => (
                              <li key={f} className="flex items-start gap-xs">
                                <span className="material-symbols-outlined text-[16px] text-primary">check</span>
                                {f}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-auto pt-sm">
                            {isCurrent ? (
                              <span className="text-xs font-semibold text-primary">Plan actual</span>
                            ) : p.priceMonthly === 0 ? (
                              <span className="text-xs text-on-surface-variant">Disponible al registrarte</span>
                            ) : (
                              <button
                                onClick={() => handleUpgrade(p.code)}
                                disabled={checkoutBusy}
                                className="w-full px-md py-xs bg-primary text-on-primary font-label-md text-label-md rounded-lg cursor-pointer hover:shadow-md transition-shadow disabled:opacity-50"
                              >
                                {checkoutBusy ? 'Preparando pago...' : 'Elegir este plan'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
  );
};