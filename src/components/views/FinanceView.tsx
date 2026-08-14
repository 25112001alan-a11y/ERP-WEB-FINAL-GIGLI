import React, { useState } from 'react';
import { ViewPath, FinanceTransaction } from '../../types';

interface FinanceViewProps {
  transactions: FinanceTransaction[];
  onNavigate: (view: ViewPath) => void;
}

export const FinanceView: React.FC<FinanceViewProps> = ({ transactions, onNavigate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'Todos' | 'Ingreso' | 'Egreso'>('Todos');
  const [txs, setTxs] = useState<FinanceTransaction[]>(transactions);
  const [showNewModal, setShowNewModal] = useState(false);

  // New Tx state
  const [concept, setConcept] = useState('');
  const [method, setMethod] = useState('Transferencia');
  const [amount, setAmount] = useState<number>(0);
  const [type, setType] = useState<'Ingreso' | 'Egreso'>('Ingreso');

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

  const handleAddTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept || amount <= 0) return;

    const newTx: FinanceTransaction = {
      id: `TX-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }),
      concept,
      method,
      amount: type === 'Egreso' ? -Math.abs(amount) : Math.abs(amount),
      type,
      status: 'Completado',
    };

    setTxs([newTx, ...txs]);
    setShowNewModal(false);
    setConcept('');
    setAmount(0);
  };

  return (
    <div className="flex flex-col w-full h-full gap-lg font-body-md text-on-surface">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-md bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
        <div>
          <span className="font-label-md text-label-md text-primary tracking-widest uppercase">Tesorería y Caja</span>
          <h1 className="font-display-lg text-display-lg text-on-surface">Módulo de Finanzas</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Control de flujo de caja, movimientos bancarios y conciliaciones en tiempo real.</p>
        </div>
        <div className="flex gap-md">
          <button
            onClick={() => setShowNewModal(true)}
            className="px-md py-sm bg-primary text-on-primary font-label-md text-label-md rounded-lg shadow-sm hover:shadow-md transition-shadow flex items-center gap-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add_card</span>
            Nuevo Movimiento de Caja
          </button>
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
          <p className="text-xs text-tertiary-container flex items-center gap-1 font-medium">
            <span className="material-symbols-outlined text-xs">trending_up</span> Conciliado con cuentas bancarias
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-sm">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Ingresos (Mes)</span>
            <span className="material-symbols-outlined text-tertiary-container">arrow_downward</span>
          </div>
          <p className="font-display-lg text-display-lg font-mono-sm text-tertiary-container">
            +${totalIngresos.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-on-surface-variant">Incluye POS, ventas B2B y transferencias</p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-sm">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Egresos (Mes)</span>
            <span className="material-symbols-outlined text-error">arrow_upward</span>
          </div>
          <p className="font-display-lg text-display-lg font-mono-sm text-error">
            -${totalEgresos.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-on-surface-variant">Pago a proveedores y gastos de operación</p>
        </div>
      </div>

      {/* Main Transactions Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 flex flex-col overflow-hidden flex-1">
        {/* Table Filters */}
        <div className="p-md border-b border-outline-variant/20 flex flex-col md:flex-row justify-between items-center gap-md">
          <div className="relative w-72">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar concepto o ID..."
              className="w-full bg-surface rounded-lg py-xs pl-9 pr-sm border border-outline-variant/50 focus:border-primary outline-none text-body-md"
            />
          </div>

          <div className="flex gap-xs">
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
              {filteredTxs.map((t) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Transaction Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-md">
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/30 max-w-md w-full p-lg flex flex-col gap-md">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-sm">
              <h2 className="font-headline-md text-headline-md text-on-surface">Registrar Movimiento</h2>
              <button onClick={() => setShowNewModal(false)} className="text-outline hover:text-on-surface cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleAddTx} className="flex flex-col gap-md">
              <div className="flex gap-md">
                <label className="flex-1 flex items-center justify-center gap-xs p-sm rounded-lg border cursor-pointer font-label-md text-label-md">
                  <input
                    type="radio"
                    name="txType"
                    checked={type === 'Ingreso'}
                    onChange={() => setType('Ingreso')}
                    className="accent-primary"
                  />
                  Ingreso (+)
                </label>
                <label className="flex-1 flex items-center justify-center gap-xs p-sm rounded-lg border cursor-pointer font-label-md text-label-md">
                  <input
                    type="radio"
                    name="txType"
                    checked={type === 'Egreso'}
                    onChange={() => setType('Egreso')}
                    className="accent-error"
                  />
                  Egreso (-)
                </label>
              </div>

              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md uppercase text-on-surface-variant">Concepto *</label>
                <input
                  type="text"
                  required
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Ej: Pago de alquiler, Venta especial..."
                  className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary"
                />
              </div>

              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md uppercase text-on-surface-variant">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="0.00"
                  className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-mono-sm"
                />
              </div>

              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md uppercase text-on-surface-variant">Método de Pago</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none cursor-pointer"
                >
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Efectivo">Efectivo / Caja Chica</option>
                  <option value="Tarjeta Crédito">Tarjeta de Crédito</option>
                  <option value="Cheque">Cheque Corporativo</option>
                </select>
              </div>

              <div className="flex justify-end gap-sm pt-sm border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-md py-xs rounded-lg border border-outline-variant text-on-surface cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-md py-xs rounded-lg bg-primary text-on-primary font-label-md cursor-pointer"
                >
                  Guardar Transacción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
