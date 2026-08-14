import React, { useState } from 'react';
import { ViewPath, AuditLog } from '../../types';

interface AuditLogViewProps {
  logs: AuditLog[];
  onNavigate: (view: ViewPath) => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs, onNavigate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('Todos');

  const filteredLogs = logs.filter((l) => {
    const matchesSearch =
      l.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.details.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMod = selectedModule === 'Todos' || l.module === selectedModule;
    return matchesSearch && matchesMod;
  });

  return (
    <div className="flex flex-col w-full h-full gap-lg font-body-md text-on-surface">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-md bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-xs">
            <button onClick={() => onNavigate('configuracion')} className="hover:text-primary transition-colors cursor-pointer">
              Configuración
            </button>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="text-on-surface font-semibold">Auditoría y Seguridad</span>
          </nav>
          <h1 className="font-display-lg text-display-lg text-on-surface">Registro de Auditoría (Audit Log)</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Trazabilidad inmutable de todas las acciones ejecutadas en el sistema ERP.</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 flex flex-col overflow-hidden flex-1">
        {/* Filter Bar */}
        <div className="p-md border-b border-outline-variant/20 flex flex-col md:flex-row justify-between items-center gap-md">
          <div className="relative w-80">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por usuario, acción o detalle..."
              className="w-full bg-surface rounded-lg py-xs pl-9 pr-sm border border-outline-variant/50 focus:border-primary outline-none text-body-md"
            />
          </div>

          <div className="flex gap-xs flex-wrap">
            {['Todos', 'Seguridad', 'Inventario', 'Ventas', 'Compras', 'Finanzas'].map((mod) => (
              <button
                key={mod}
                onClick={() => setSelectedModule(mod)}
                className={`px-md py-xs rounded-lg font-label-md text-label-md cursor-pointer transition-colors ${
                  selectedModule === mod
                    ? 'bg-primary text-on-primary font-bold'
                    : 'bg-surface hover:bg-surface-container-high text-on-surface-variant'
                }`}
              >
                {mod}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/20 font-label-md text-label-md text-on-surface-variant uppercase">
                <th className="py-sm px-md">Fecha y Hora</th>
                <th className="py-sm px-md">Usuario</th>
                <th className="py-sm px-md">Módulo</th>
                <th className="py-sm px-md">Acción</th>
                <th className="py-sm px-md">Dirección IP</th>
                <th className="py-sm px-md">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-body-md">
              {filteredLogs.map((l) => (
                <tr key={l.id} className="hover:bg-surface-container/20">
                  <td className="py-sm px-md text-on-surface-variant text-xs font-mono-sm whitespace-nowrap">{l.timestamp}</td>
                  <td className="py-sm px-md">
                    <div className="flex items-center gap-xs">
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary font-bold text-[10px] flex items-center justify-center">
                        {l.userInitials}
                      </div>
                      <span className="font-medium text-on-surface">{l.user}</span>
                    </div>
                  </td>
                  <td className="py-sm px-md">
                    <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant text-xs font-mono-sm">
                      {l.module}
                    </span>
                  </td>
                  <td className="py-sm px-md font-semibold text-primary">{l.action}</td>
                  <td className="py-sm px-md text-on-surface-variant font-mono-sm text-xs">{l.ip}</td>
                  <td className="py-sm px-md text-on-surface-variant text-xs truncate max-w-xs">{l.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
