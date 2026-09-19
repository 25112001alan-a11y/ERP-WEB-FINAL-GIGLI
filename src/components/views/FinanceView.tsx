import React, { useState } from 'react';
import { ViewPath, FinanceTransaction } from '../../types';

interface FinanceViewProps {
  transactions: FinanceTransaction[];
  onNavigate: (view: ViewPath) => void;
}

export const FinanceView: React.FC<FinanceViewProps> = ({ transactions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'Todos' | 'Ingreso' | 'Egreso'>('Todos');

  const txs = transactions;

  const filteredTxs = txs.filter((t) => {
    const matchesSearch =
      t.concept.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'Todos' || t.type === filterType;
    return matchesSearch && matchesType;
  });

  const totalIngresos = txs.filter((t) => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
  const totalEgresos = Math.abs(txs.filter((t) => t.amount < 0).reduce((acc, t) => acc + t.amount, 0));
  const netBalance = totalIngresos - totalEgresos;

  return (
    <div className="flex flex-col w-full h-full gap-lg font-body-md text-on-surface">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-md bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
        <div>
          <span className="font-label-md text-label-md text-primary tracking-widest uppercase">Tesorería y Caja</span>
          <h1 className="font-display-lg text-display-lg text-on-surface">Módulo de Finanzas</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Flujo de caja derivado de comprobantes y sus pagos registrados.</p>
        </div>
      </div>

      {/* Financial Summary Bento Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-sm">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Balance Neto Disponible</span>
            <span className="material-symbols-outlined text-primary">account_balance</span>
          </div>
          <p className="font-display-lg text-display-lg font-mono-sm text-primary">
            ${netBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-on-surface-variant flex items-center gap-1 font-medium">
            <span className="material-symbols-outlined text-xs">receipt_long</span> Suma de pagos de comprobantes
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-sm">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Ingresos</span>
            <span className="material-symbols-outlined text-tertiary-container">arrow_downward</span>
          </div>
          <p className="font-display-lg text-display-lg font-mono-sm text-tertiary-container">
            +${totalIngresos.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-on-surface-variant">Pagos recibidos en ventas y facturas</p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-sm">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Egresos</span>
            <span className="material-symbols-outlined text-error">arrow_upward</span>
          </div>
          <p className="font-display-lg text-display-lg font-mono-sm text-error">
            -${totalEgresos.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-on-surface-variant">Pagos a proveedores (compras y facturas)</p>
        </div>
      </div>

      {/* Main Transactions Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 flex flex-col overflow-hidden flex-1">
        {/* Table Filters */}
        <div className="p-md border-b border-outline-variant/20 flex flex-col md:flex-row justify-between items-center gap-md">
          <div className="relative w-full sm:w-72">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar concepto o ID..."
              className="w-full bg-surface rounded-lg py-xs pl-9 pr-sm border border-outline-variant/50 focus:border-primary outline-none text-body-md"
            />
          </div>

          <div className="flex gap-xs flex-wrap">
            {(['Todos', 'Ingreso', 'Egreso'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-md py-xs rounded-lg font-label-md text-label-md cursor-pointer transition-colors ${
                  filterType === t
                    ? 'bg-secondary-container text-on-secondary-container font-bold'
                    : 'bg-surface hover:bg-surface-container-high text-on-surface-variant'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          {txs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-md py-16 text-center">
              <span className="material-symbols-outlined text-[48px] text-outline-variant">payments</span>
              <p className="font-body-lg text-body-lg text-on-surface-variant">
                Todavía no hay movimientos de caja.
              </p>
              <p className="text-body-md text-on-surface-variant max-w-[28rem]">
                Los movimientos se generan automáticamente al registrar ventas, facturas y compras con sus pagos.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/20 font-label-md text-label-md text-on-surface-variant uppercase">
                  <th className="py-sm px-md">ID Transacción</th>
                  <th className="py-sm px-md">Fecha y Hora</th>
                  <th className="py-sm px-md">Concepto</th>
                  <th className="py-sm px-md">Método de Pago</th>
                  <th className="py-sm px-md text-right">Monto</th>
                  <th className="py-sm px-md text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 text-body-md">
                {filteredTxs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-on-surface-variant">
                      No se encontraron movimientos con ese filtro.
                    </td>
                  </tr>
                ) : (
                  filteredTxs.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-container/20 transition-colors">
                      <td className="py-sm px-md font-mono-sm font-bold text-primary">{t.id}</td>
                      <td className="py-sm px-md text-on-surface-variant">{t.date}</td>
                      <td className="py-sm px-md font-medium">{t.concept}</td>
                      <td className="py-sm px-md text-on-surface-variant">{t.method}</td>
                      <td className={`py-sm px-md text-right font-mono-sm font-bold ${t.amount > 0 ? 'text-tertiary-container' : 'text-error'}`}>
                        {t.amount > 0 ? `+$${t.amount.toFixed(2)}` : `-$${Math.abs(t.amount).toFixed(2)}`}
                      </td>
                      <td className="py-sm px-md text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            t.status === 'Conciliado'
                              ? 'bg-tertiary-container/20 text-on-tertiary-container'
                              : 'bg-secondary-container/20 text-secondary'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};