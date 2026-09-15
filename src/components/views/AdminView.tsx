import React, { useState } from 'react';
import { ViewPath, User, RoleOption } from '../../types';

interface AdminViewProps {
  users: User[];
  roles: RoleOption[];
  onNavigate: (view: ViewPath) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({ users, roles, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'usuarios' | 'roles'>('usuarios');

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
        </div>
      </div>
    </div>
  );
};