import React, { useEffect, useState } from 'react';
import { ViewPath, User, RoleOption, BillingAdminOverview } from '../../types';
import { apiFetch } from '../../lib/api';

interface AdminViewProps {
  users: User[];
  roles: RoleOption[];
  permissions: string[];
  onNavigate: (view: ViewPath) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({ users, roles, permissions, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'usuarios' | 'roles' | 'billing'>('usuarios');
  const canViewBilling = permissions.includes('billing.manage');

  // Billing overview (SuperAdmin – billing.manage)
  const [overview, setOverview] = useState<BillingAdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');

  useEffect(() => {
    if (!canViewBilling || activeTab !== 'billing') return;
    let cancelled = false;
    setOverviewLoading(true);
    apiFetch<BillingAdminOverview>('/api/billing/admin/overview')
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {
        if (!cancelled) setOverviewError('No se pudo cargar el resumen de facturación.');
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canViewBilling, activeTab]);

  return (
    <div className="flex flex-col w-full h-full gap-lg font-body-md text-on-surface">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-md bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
        <div>
          <span className="font-label-md text-label-md text-primary tracking-widest uppercase">Administración del Sistema</span>
          <h1 className="font-display-lg text-display-lg text-on-surface">Panel de Administración</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Gestión de usuarios, roles, permisos y seguridad de la plataforma.</p>
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
          {canViewBilling && (
            <button
              onClick={() => setActiveTab('billing')}
              className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors ${
                activeTab === 'billing' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Facturación
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="p-lg flex-1 overflow-auto">
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
            <div className="space-y-md">
              <p className="font-body-md text-on-surface-variant">Roles configurados y sus permisos en la plataforma.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                {roles.map((r) => (
                  <div key={r.id} className="p-md rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-headline-md text-headline-md text-primary">{r.name}</span>
                      <span className="material-symbols-outlined text-outline">verified_user</span>
                    </div>
                    <p className="font-body-md text-xs text-on-surface-variant">{r.description ?? 'Sin descripción.'}</p>
                  </div>
                ))}
                {roles.length === 0 && (
                  <p className="text-on-surface-variant text-sm">No hay roles configurados.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'billing' && canViewBilling && (
            <div className="space-y-md">
              <p className="font-body-md text-on-surface-variant">Resumen de suscripciones, ingresos recurrentes (MRR) y eventos de Mercado Pago.</p>

              {overviewError && (
                <p className="text-sm text-on-error-container bg-error-container/20 rounded-lg p-sm">{overviewError}</p>
              )}

              {!overviewLoading && overview && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
                    <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant/30">
                      <p className="font-label-md text-label-md uppercase text-on-surface-variant">Empresas</p>
                      <p className="font-display-lg text-display-lg text-on-surface">{overview.totals.companies}</p>
                    </div>
                    <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant/30">
                      <p className="font-label-md text-label-md uppercase text-on-surface-variant">Suscripciones activas</p>
                      <p className="font-display-lg text-display-lg text-primary">{overview.totals.activeSubscriptions}</p>
                      <p className="text-xs text-on-surface-variant">
                        {overview.totals.pendingSubscriptions} pendientes · {overview.totals.pastDueSubscriptions} vencidas ·{' '}
                        {overview.totals.canceledSubscriptions} canceladas
                      </p>
                    </div>
                    <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant/30">
                      <p className="font-label-md text-label-md uppercase text-on-surface-variant">MRR (USD)</p>
                      <p className="font-display-lg text-display-lg text-on-surface">{overview.totals.mrrUsd.toFixed(2)}</p>
                    </div>
                    <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant/30">
                      <p className="font-label-md text-label-md uppercase text-on-surface-variant">Sin suscripción</p>
                      <p className="font-display-lg text-display-lg text-on-surface">{overview.unsubscribedCompanies.length}</p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {overview.unsubscribedCompanies.map((c) => c.name).join(', ') || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-outline-variant/20 overflow-hidden">
                    <div className="bg-surface-container-low px-md py-sm font-label-md text-label-md text-on-surface-variant uppercase">
                      Últimos eventos de Mercado Pago
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-container-low border-b border-outline-variant/20 font-label-md text-label-md text-on-surface-variant uppercase">
                          <th className="py-sm px-md">Evento</th>
                          <th className="py-sm px-md">Topic</th>
                          <th className="py-sm px-md">Fecha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10 text-body-md">
                        {overview.recentEvents.map((ev) => (
                          <tr key={ev.eventId} className="hover:bg-surface-container/20">
                            <td className="py-sm px-md font-mono-sm text-on-surface">{ev.eventId}</td>
                            <td className="py-sm px-md">
                              <span className="px-2 py-1 rounded bg-secondary-container/20 text-secondary font-label-md text-xs">
                                {ev.topic}
                              </span>
                            </td>
                            <td className="py-sm px-md text-on-surface-variant text-xs">
                              {new Date(ev.createdAt).toLocaleString('es-AR')}
                            </td>
                          </tr>
                        ))}
                        {overview.recentEvents.length === 0 && (
                          <tr>
                            <td colSpan={3} className="py-sm px-md text-on-surface-variant text-sm">
                              Aún no hay eventos registrados.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};