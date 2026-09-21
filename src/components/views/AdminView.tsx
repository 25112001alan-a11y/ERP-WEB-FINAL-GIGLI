import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ViewPath, User, RoleOption, PermissionOption, BillingAdminOverview } from '../../types';
import { apiFetch, ApiError } from '../../lib/api';
import { Modal } from '../Modal';

interface AdminViewProps {
  users: User[];
  roles: RoleOption[];
  permissions: string[];
  onNavigate: (view: ViewPath) => void;
  onRolesChanged?: () => void;
}

interface RoleDetail extends RoleOption {
  permissions: string[];
  permissionCount: number;
  userCount: number;
}

const MODULE_ORDER = [
  'inventario',
  'ventas',
  'compras',
  'finanzas',
  'configuracion',
  'usuarios',
  'auditoria',
  'reportes',
  'billing',
];

function groupByPrefix(names: PermissionOption[] | string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const list = names.map((n) => (typeof n === 'string' ? n : n.name));
  for (const name of list) {
    const prefix = name.includes('.') ? name.split('.')[0] : 'otros';
    if (!map.has(prefix)) map.set(prefix, []);
    map.get(prefix)!.push(name);
  }
  for (const [, arr] of map) arr.sort();
  return new Map(
    [...map.entries()].sort(
      (a, b) => MODULE_ORDER.indexOf(a[0]) - MODULE_ORDER.indexOf(b[0]),
    ),
  );
}

function describePermission(name: string, catalog: PermissionOption[]): string {
  return catalog.find((p) => p.name === name)?.description ?? '';
}

export const AdminView: React.FC<AdminViewProps> = ({ users, roles, permissions, onNavigate, onRolesChanged }) => {
  const [activeTab, setActiveTab] = useState<'usuarios' | 'roles' | 'permisos' | 'billing'>('usuarios');
  const canViewBilling = permissions.includes('billing.manage');
  const canManageRoles = permissions.includes('usuarios.escribir');

  // Billing overview (SuperAdmin – billing.manage)
  const [overview, setOverview] = useState<BillingAdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');

  // Company count for header
  const [companyCount, setCompanyCount] = useState<number | null>(null);

  // Roles + global permission catalog (Fase 2: custom roles)
  const [roleDetails, setRoleDetails] = useState<RoleDetail[]>([]);
  const [catalog, setCatalog] = useState<PermissionOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState('');

  // Role modal (create / edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleDetail | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPerms, setFormPerms] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Delete confirm
  const [deleting, setDeleting] = useState<RoleDetail | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSaving, setDeleteSaving] = useState(false);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    setRolesError('');
    try {
      const [detailed, perms] = await Promise.all([
        apiFetch<RoleDetail[]>('/api/users/roles'),
        apiFetch<PermissionOption[]>('/api/users/permissions'),
      ]);
      setRoleDetails(detailed);
      setCatalog(perms);
    } catch {
      setRolesError('No se pudieron cargar los roles y permisos.');
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'roles' || activeTab === 'permisos') void loadRoles();
  }, [activeTab, loadRoles]);

  // Fallback: props roles (id/name/description) until the detailed fetch lands.
  const visibleRoles: RoleDetail[] = useMemo(() => {
    if (roleDetails.length > 0) return roleDetails;
    return roles.map((r) => ({
      ...r,
      permissions: r.permissions ?? [],
      permissionCount: r.permissionCount ?? r.permissions?.length ?? 0,
      userCount: r.userCount ?? 0,
    }));
  }, [roleDetails, roles]);

  const groupedCatalog = useMemo(() => groupByPrefix(catalog), [catalog]);

  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormDescription('');
    setFormPerms(new Set());
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (role: RoleDetail) => {
    setEditing(role);
    setFormName(role.name);
    setFormDescription(role.description ?? '');
    setFormPerms(new Set(role.permissions));
    setFormError('');
    setModalOpen(true);
  };

  const togglePerm = (name: string) => {
    setFormPerms((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSaveRole = async () => {
    const name = formName.trim();
    if (name.length < 2 || name.length > 50) {
      setFormError('El nombre debe tener entre 2 y 50 caracteres.');
      return;
    }
    if (formPerms.size === 0) {
      setFormError('El rol debe tener al menos un permiso.');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      const body = {
        name,
        description: formDescription.trim() || null,
        permissionNames: [...formPerms],
      };
      if (editing) {
        await apiFetch(`/api/users/roles/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiFetch('/api/users/roles', { method: 'POST', body });
      }
      setModalOpen(false);
      await loadRoles();
      onRolesChanged?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar el rol.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!deleting) return;
    setDeleteSaving(true);
    setDeleteError('');
    try {
      await apiFetch(`/api/users/roles/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      await loadRoles();
      onRolesChanged?.();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'No se pudo eliminar el rol.');
    } finally {
      setDeleteSaving(false);
    }
  };

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

  // Fetch company count for header (SuperAdmin gets total, regular admin gets 1)
  useEffect(() => {
    let cancelled = false;
    if (canViewBilling) {
      apiFetch<BillingAdminOverview>('/api/billing/admin/overview')
        .then((data) => {
          if (!cancelled) setCompanyCount(data.totals.companies);
        })
        .catch(() => {
          if (!cancelled) setCompanyCount(1);
        });
    } else {
      // Regular admin: their own company
      setCompanyCount(1);
    }
    return () => {
      cancelled = true;
    };
  }, [canViewBilling]);

  return (
    <div className="flex flex-col w-full h-full gap-lg font-body-md text-on-surface">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-md bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
        <div>
          <span className="font-label-md text-label-md text-primary tracking-widest uppercase">Administración del Sistema</span>
          <h1 className="font-display-lg text-display-lg text-on-surface">Panel de Administración</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            {companyCount !== null
              ? `${companyCount} ${companyCount === 1 ? 'empresa' : 'empresas'} • Gestión de usuarios, roles, permisos y seguridad.`
              : 'Gestión de usuarios, roles, permisos y seguridad de la plataforma.'}
          </p>
        </div>
        <div className="flex gap-md flex-wrap">
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
        <div className="flex border-b border-outline-variant/20 bg-surface-container-low px-lg pt-sm gap-md overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('usuarios')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'usuarios' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Usuarios ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'roles' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Roles ({visibleRoles.length})
          </button>
          <button
            onClick={() => setActiveTab('permisos')}
            className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'permisos' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Permisos ({catalog.length})
          </button>
          {canViewBilling && (
            <button
              onClick={() => setActiveTab('billing')}
              className={`py-sm px-md font-label-md text-label-md uppercase tracking-wider border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
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
              <div className="flex justify-between items-center flex-wrap gap-sm">
                <p className="font-body-md text-on-surface-variant">Roles de la empresa. Cada rol combina permisos del catálogo global.</p>
                {canManageRoles && (
                  <button
                    onClick={openCreate}
                    className="px-md py-xs bg-primary text-on-primary font-label-md text-xs rounded-lg cursor-pointer"
                  >
                    + Nuevo rol
                  </button>
                )}
              </div>

              {rolesError && (
                <p className="text-sm text-on-error-container bg-error-container/20 rounded-lg p-sm">{rolesError}</p>
              )}

              {rolesLoading ? (
                <p className="text-on-surface-variant text-sm">Cargando roles…</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-outline-variant/20">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant/20 font-label-md text-label-md text-on-surface-variant uppercase">
                        <th className="py-sm px-md">Rol</th>
                        <th className="py-sm px-md text-center">Usuarios</th>
                        <th className="py-sm px-md text-center">Permisos</th>
                        {canManageRoles && <th className="py-sm px-md text-right">Acciones</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10 text-body-md">
                      {visibleRoles.map((r) => (
                        <tr key={r.id} className="hover:bg-surface-container/20">
                          <td className="py-sm px-md">
                            <p className="font-semibold text-on-surface">{r.name}</p>
                            {r.description && <p className="text-xs text-on-surface-variant">{r.description}</p>}
                          </td>
                          <td className="py-sm px-md text-center text-on-surface-variant">{r.userCount}</td>
                          <td className="py-sm px-md text-center text-on-surface-variant">{r.permissionCount}</td>
                          {canManageRoles && (
                            <td className="py-sm px-md text-right whitespace-nowrap">
                              <button
                                onClick={() => openEdit(r)}
                                className="px-sm py-xs text-primary font-label-md text-xs rounded-lg hover:bg-primary/10 cursor-pointer"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => { setDeleting(r); setDeleteError(''); }}
                                disabled={r.name === 'Super Admin'}
                                title={r.name === 'Super Admin' ? "El rol 'Super Admin' no puede eliminarse" : 'Eliminar rol'}
                                className="px-sm py-xs text-error font-label-md text-xs rounded-lg hover:bg-error-container/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Eliminar
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {visibleRoles.length === 0 && (
                        <tr>
                          <td colSpan={canManageRoles ? 4 : 3} className="py-sm px-md text-on-surface-variant text-sm">
                            No hay roles configurados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {!canManageRoles && (
                <p className="text-xs text-on-surface-variant">Necesitás el permiso «usuarios.escribir» para crear o editar roles.</p>
              )}
            </div>
          )}

          {activeTab === 'permisos' && (
            <div className="space-y-md">
              <p className="font-body-md text-on-surface-variant">
                Catálogo global de permisos: estos permisos se asignan a los roles. Solo lectura.
              </p>
              {rolesError && (
                <p className="text-sm text-on-error-container bg-error-container/20 rounded-lg p-sm">{rolesError}</p>
              )}
              {rolesLoading ? (
                <p className="text-on-surface-variant text-sm">Cargando permisos…</p>
              ) : (
                <div className="space-y-md">
                  {[...groupedCatalog.entries()].map(([module, names]) => (
                    <div key={module} className="rounded-lg border border-outline-variant/20 overflow-hidden">
                      <div className="bg-surface-container-low px-md py-sm font-label-md text-label-md text-on-surface-variant uppercase">
                        {module} ({names.length})
                      </div>
                      <ul className="divide-y divide-outline-variant/10">
                        {names.map((name) => (
                          <li key={name} className="px-md py-sm flex flex-col gap-xs">
                            <span className="font-mono-sm text-on-surface">{name}</span>
                            {describePermission(name, catalog) && (
                              <span className="text-xs text-on-surface-variant">{describePermission(name, catalog)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {catalog.length === 0 && (
                    <p className="text-on-surface-variant text-sm">No hay permisos en el catálogo.</p>
                  )}
                </div>
              )}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
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
                      <p className="text-xs text-on-surface-variant line-clamp-2 break-words">
                        {overview.unsubscribedCompanies.map((c) => c.name).join(', ') || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-outline-variant/20">
                    <div className="bg-surface-container-low px-md py-sm font-label-md text-label-md text-on-surface-variant uppercase">
                      Últimos eventos de Mercado Pago
                    </div>
                    <div className="overflow-x-auto">
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
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Role create/edit modal */}
      {modalOpen && (
        <Modal
          title={editing ? `Editar rol «${editing.name}»` : 'Nuevo rol'}
          onClose={() => setModalOpen(false)}
          maxWidth="max-w-2xl"
          footer={
            <>
              <button
                onClick={() => setModalOpen(false)}
                disabled={formSaving}
                className="px-md py-sm rounded-lg border border-outline-variant/40 text-on-surface font-label-md text-label-md cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleSaveRole()}
                disabled={formSaving}
                className="px-md py-sm rounded-lg bg-primary text-on-primary font-label-md text-label-md cursor-pointer disabled:opacity-50"
              >
                {formSaving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear rol'}
              </button>
            </>
          }
        >
            <div className="space-y-sm">
              <label className="block">
                <span className="font-label-md text-label-md text-on-surface-variant">Nombre</span>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={50}
                  disabled={editing?.name === 'Super Admin'}
                  placeholder="Ej. Encargado de depósito"
                  className="mt-xs w-full px-md py-sm rounded-lg border border-outline-variant/40 bg-surface text-on-surface"
                />
              </label>
              <label className="block">
                <span className="font-label-md text-label-md text-on-surface-variant">Descripción (opcional)</span>
                <input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  maxLength={500}
                  placeholder="Qué puede hacer este rol"
                  className="mt-xs w-full px-md py-sm rounded-lg border border-outline-variant/40 bg-surface text-on-surface"
                />
              </label>
            </div>
            <div className="space-y-sm">
              <p className="font-label-md text-label-md text-on-surface-variant">
                Permisos ({formPerms.size} seleccionados)
              </p>
              {[...groupByPrefix(catalog).entries()].map(([module, names]) => (
                <div key={module} className="rounded-lg border border-outline-variant/20 overflow-hidden">
                  <div className="bg-surface-container-low px-md py-sm font-label-md text-label-md text-on-surface-variant uppercase">
                    {module}
                  </div>
                  <div className="p-md grid grid-cols-1 sm:grid-cols-2 gap-sm">
                    {names.map((name) => (
                      <label key={name} className="flex items-center gap-sm text-sm text-on-surface cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formPerms.has(name)}
                          onChange={() => togglePerm(name)}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="font-mono-sm">{name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {catalog.length === 0 && (
                <p className="text-on-surface-variant text-sm">Sin catálogo disponible.</p>
              )}
            </div>
            {formError && (
              <p className="text-sm text-on-error-container bg-error-container/20 rounded-lg p-sm">{formError}</p>
            )}
        </Modal>
      )}

      {/* Delete confirm */}
      {deleting && (
        <Modal
          title={`Eliminar rol «${deleting.name}»`}
          onClose={() => setDeleting(null)}
          maxWidth="max-w-md"
          footer={
            <>
              <button
                onClick={() => setDeleting(null)}
                disabled={deleteSaving}
                className="px-md py-sm rounded-lg border border-outline-variant/40 text-on-surface font-label-md text-label-md cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleDeleteRole()}
                disabled={deleteSaving}
                className="px-md py-sm rounded-lg bg-error text-on-error font-label-md text-label-md cursor-pointer disabled:opacity-50"
              >
                {deleteSaving ? 'Eliminando…' : 'Eliminar'}
              </button>
            </>
          }
        >
          <p className="text-sm text-on-surface-variant">
            Esta acción no se puede deshacer. Si el rol tiene usuarios asignados, el servidor lo rechaza.
          </p>
          {deleteError && (
            <p className="text-sm text-on-error-container bg-error-container/20 rounded-lg p-sm">{deleteError}</p>
          )}
        </Modal>
      )}
    </div>
  );
};
