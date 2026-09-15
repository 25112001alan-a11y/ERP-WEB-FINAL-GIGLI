import React, { useEffect, useState } from 'react';
import { ViewPath, TaxRate } from '../../types';
import { apiFetch } from '../../lib/api';

interface SettingsViewProps {
  taxes: TaxRate[];
  onAddTax: (name: string, rate: number) => Promise<void>;
  onToggleTax: (id: number, active: boolean) => Promise<void>;
  onNavigate: (view: ViewPath) => void;
}

interface CompanyProfile {
  id: number;
  name: string;
  legalName: string | null;
  taxId: string | null;
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

export const SettingsView: React.FC<SettingsViewProps> = ({ taxes, onAddTax, onToggleTax, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'empresa' | 'impuestos'>('empresa');

  // Company state (backed by GET/PATCH /api/company)
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyError, setCompanyError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');
  const [savedMsg, setSavedMsg] = useState(false);

  // Tax form state
  const [taxName, setTaxName] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [taxError, setTaxError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch<CompanyProfile>('/api/company')
      .then((c) => {
        if (cancelled) return;
        setCompany(c);
        setCompanyName(c.name ?? '');
        setLegalName(c.legalName ?? '');
        setTaxId(c.taxId ?? '');
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

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompanyError('');
    try {
      const updated = await apiFetch<CompanyProfile>('/api/company', {
        method: 'PATCH',
        body: {
          name: companyName.trim(),
          legalName: legalName.trim() || null,
          taxId: taxId.trim() || null,
          currency,
          timezone,
        },
      });
      setCompany(updated);
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
        <div className="flex border-b border-outline-variant/20 bg-surface-container-low px-lg pt-sm gap-md">
          <button
            onClick={() => setActiveTab('empresa')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors ${
              activeTab === 'empresa' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Datos de la Empresa
          </button>
          <button
            onClick={() => setActiveTab('impuestos')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors ${
              activeTab === 'impuestos' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Impuestos y Monedas
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
            <form onSubmit={handleSaveCompany} className="max-w-2xl space-y-md">
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

                  <div className="grid grid-cols-2 gap-md">
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
            <div className="space-y-md max-w-2xl">
              <h3 className="font-headline-md text-headline-md text-on-surface">Tasas de Impuesto</h3>
              <div className="space-y-sm">
                {taxes.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-md bg-surface-container-low rounded-lg border border-outline-variant/30">
                    <div>
                      <p className="font-semibold text-on-surface">{t.name}</p>
                      <p className="text-xs text-on-surface-variant">{t.active ? 'Tasa activa' : 'Desactivada'}</p>
                    </div>
                    <div className="flex items-center gap-md">
                      <span className="font-mono-sm font-bold text-primary text-headline-md">{Number(t.rate).toFixed(1)}%</span>
                      <button
                        onClick={() => onToggleTax(t.id, !t.active)}
                        className={`px-2 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                          t.active ? 'bg-tertiary-container/20 text-on-tertiary-container' : 'bg-surface-container-high text-on-surface-variant'
                        }`}
                      >
                        {t.active ? 'Activa' : 'Inactiva'}
                      </button>
                    </div>
                  </div>
                ))}
                {taxes.length === 0 && (
                  <p className="text-on-surface-variant text-sm">No hay tasas de impuesto configuradas.</p>
                )}
              </div>

              <form onSubmit={handleAddTax} className="flex flex-wrap items-end gap-md p-md rounded-xl border border-outline-variant/30 bg-surface-container-low max-w-xl">
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
        </div>
      </div>
    </div>
  );
};