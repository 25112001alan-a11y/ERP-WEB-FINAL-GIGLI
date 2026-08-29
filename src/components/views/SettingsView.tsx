import React, { useState } from 'react';
import { ViewPath, User, TaxRate } from '../../types';

interface SettingsViewProps {
  users: User[];
  taxes: TaxRate[];
  onAddTax: (name: string, rate: number) => Promise<void>;
  onToggleTax: (id: number, active: boolean) => Promise<void>;
  onNavigate: (view: ViewPath) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ users, taxes, onAddTax, onToggleTax, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'empresa' | 'impuestos' | 'usuarios' | 'roles'>('empresa');

  // Company state
  const [companyName, setCompanyName] = useState('Nexus Enterprise Corp');
  const [taxId, setTaxId] = useState('76.543.210-K');
  const [currency, setCurrency] = useState('USD ($)');
  const [timezone, setTimezone] = useState('America/Santiago (UTC-3)');
  const [savedMsg, setSavedMsg] = useState(false);

  // Tax form state
  const [taxName, setTaxName] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [taxError, setTaxError] = useState('');

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
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
          <p className="font-body-lg text-body-lg text-on-surface-variant">Gestión de datos de la empresa, impuestos, monedas, usuarios y seguridad.</p>
        </div>
        <div className="flex gap-md">
          <button
            onClick={() => onNavigate('log-auditoria')}
            className="px-md py-sm bg-surface-container-high text-on-surface font-label-md text-label-md rounded-lg shadow-sm hover:bg-surface-container-highest transition-colors flex items-center gap-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">shield_with_heart</span>
            Ver Log de Auditoría
          </button>
          <button
            onClick={() => onNavigate('nuevo-usuario')}
            className="px-md py-sm bg-primary text-on-primary font-label-md text-label-md rounded-lg shadow-sm hover:shadow-md transition-shadow flex items-center gap-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Nuevo Usuario
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
          <button
            onClick={() => setActiveTab('usuarios')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors ${
              activeTab === 'usuarios' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Usuarios ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors ${
              activeTab === 'roles' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Roles y Permisos
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
                <label className="font-label-md text-label-md uppercase text-on-surface-variant">Identificación Fiscal (RUT / Tax ID) *</label>
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-mono-sm"
                  required
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
                    <option value="USD ($)">USD ($) - Dólar Estadounidense</option>
                    <option value="CLP ($)">CLP ($) - Peso Chileno</option>
                    <option value="EUR (€)">EUR (€) - Euro</option>
                    <option value="MXN ($)">MXN ($) - Peso Mexicano</option>
                  </select>
                </div>

                <div className="flex flex-col gap-xs">
                  <label className="font-label-md text-label-md uppercase text-on-surface-variant">Zona Horaria</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none cursor-pointer"
                  >
                    <option value="America/Santiago (UTC-3)">America/Santiago (UTC-3)</option>
                    <option value="America/Mexico_City (UTC-6)">America/Mexico_City (UTC-6)</option>
                    <option value="Europe/Madrid (UTC+1)">Europe/Madrid (UTC+1)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="px-lg py-sm bg-primary text-on-primary font-label-md text-label-md rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              >
                Guardar Cambios
              </button>
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

          {activeTab === 'usuarios' && (
            <div className="space-y-md">
              <div className="flex justify-between items-center">
                <p className="font-body-md text-on-surface-variant">Listado de usuarios registrados en la plataforma.</p>
                <button
                  onClick={() => onNavigate('nuevo-usuario')}
                  className="px-md py-xs bg-primary text-on-primary font-label-md text-xs rounded-lg cursor-pointer"
                >
                  + Registrar Usuario
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-outline-variant/20">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant/20 font-label-md text-label-md text-on-surface-variant uppercase">
                      <th className="py-sm px-md">Usuario</th>
                      <th className="py-sm px-md">Email</th>
                      <th className="py-sm px-md">Rol</th>
                      <th className="py-sm px-md">Último Acceso</th>
                      <th className="py-sm px-md text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10 text-body-md">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-surface-container/20">
                        <td className="py-sm px-md font-semibold text-on-surface">{u.name}</td>
                        <td className="py-sm px-md text-on-surface-variant font-mono-sm">{u.email}</td>
                        <td className="py-sm px-md">
                          <span className="px-2 py-1 rounded bg-secondary-container/20 text-secondary font-label-md text-xs">
                            {u.role}
                          </span>
                        </td>
                        <td className="py-sm px-md text-on-surface-variant text-xs">{u.lastAccess}</td>
                        <td className="py-sm px-md text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              u.status === 'Activo' ? 'bg-tertiary-container/20 text-on-tertiary-container' : 'bg-surface-container-high text-on-surface-variant'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'roles' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              {[
                { role: 'Super Admin', desc: 'Acceso total sin restricciones a todos los módulos y logs de auditoría.' },
                { role: 'Gerente Ventas', desc: 'Gestión de POS, cotizaciones, pedidos de clientes y descuentos.' },
                { role: 'Analista Inventario', desc: 'Control de stock, ajustes, transferencias y recepción de remitos.' },
                { role: 'Cajero POS', desc: 'Operación exclusiva del Punto de Venta y cobro directo.' },
              ].map((r) => (
                <div key={r.role} className="p-md rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-headline-md text-headline-md text-primary">{r.role}</span>
                    <span className="material-symbols-outlined text-outline">verified_user</span>
                  </div>
                  <p className="font-body-md text-xs text-on-surface-variant">{r.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
