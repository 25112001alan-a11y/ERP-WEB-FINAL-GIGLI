import React, { useState } from 'react';
import { ViewPath, PublicOrder } from '../../types';
import { ApiError, apiFetch } from '../../lib/api';
import { ApiDocument } from '../../lib/mappers';

interface PublicOrdersViewProps {
  orders: PublicOrder[];
  onNavigate: (view: ViewPath) => void;
  onRefresh: () => void;
}

// Next status per logistics state (mirrors PATCH /api/documents/:id/status).
const NEXT_STATUS: Record<string, { to: string; label: string } | null> = {
  Nuevo: { to: 'En Proceso', label: 'Marcar en proceso' },
  'En Proceso': { to: 'Enviado', label: 'Marcar enviado' },
  Enviado: null,
  Anulado: null,
};

const LOGISTICS_STYLES: Record<string, string> = {
  Enviado: 'bg-surface-container-high text-on-surface-variant',
  'En Proceso': 'bg-secondary-container/10 text-secondary border border-secondary-container/20',
  Anulado: 'bg-error-container text-on-error-container',
  Nuevo: 'bg-surface-container-high text-on-surface',
};

export const PublicOrdersView: React.FC<PublicOrdersViewProps> = ({ orders, onNavigate, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionId, setActionId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [printOrder, setPrintOrder] = useState<PublicOrder | null>(null);
  const [printDetail, setPrintDetail] = useState<ApiDocument | null>(null);
  const [printLoading, setPrintLoading] = useState(false);

  const filteredOrders = orders.filter(
    (o) =>
      o.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingNew = orders.filter((o) => o.logisticsStatus === 'Nuevo').length;
  const inProgress = orders.filter((o) => o.logisticsStatus === 'En Proceso').length;
  const shipped = orders.filter((o) => o.logisticsStatus === 'Enviado').length;

  const dayKey = (iso: string): string => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  const DAY_MS = 86_400_000;
  const today = new Date();
  const todayKey = dayKey(today.toISOString());
  const yesterdayKey = dayKey(new Date(today.getTime() - DAY_MS).toISOString());

  const todayNewCount = orders.filter((o) => o.logisticsStatus === 'Nuevo' && dayKey(o.createdAt) === todayKey).length;
  const yesterdayNewCount = orders.filter((o) => o.logisticsStatus === 'Nuevo' && dayKey(o.createdAt) === yesterdayKey).length;
  const newDelta = yesterdayNewCount > 0 ? Math.round(((todayNewCount - yesterdayNewCount) / yesterdayNewCount) * 100) : null;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today.getTime() - (6 - i) * DAY_MS);
    const key = dayKey(day.toISOString());
    return {
      label: i === 6 ? 'Hoy' : day.toLocaleDateString('es-ES', { weekday: 'short' }),
      key,
      count: orders.filter((o) => dayKey(o.createdAt) === key).length,
    };
  });
  const weeklyMax = Math.max(1, ...weekDays.map((d) => d.count));

  const changeStatus = async (order: PublicOrder, status: string) => {
    setActionId(order.documentId);
    setError('');
    try {
      await apiFetch(`/api/documents/${order.documentId}/status`, {
        method: 'PATCH',
        body: { status },
      });
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el pedido');
    } finally {
      setActionId(null);
    }
  };

  const handleAdvance = (order: PublicOrder) => {
    const next = NEXT_STATUS[order.logisticsStatus];
    if (next) void changeStatus(order, next.to);
  };

  const handleAnular = (order: PublicOrder) => {
    if (!window.confirm(`¿Anular el pedido ${order.id} de ${order.client}? Esta acción no se puede deshacer.`)) return;
    void changeStatus(order, 'Anulado');
  };

  const openPrint = async (order: PublicOrder) => {
    setPrintOrder(order);
    setPrintDetail(null);
    setPrintLoading(true);
    try {
      const detail = await apiFetch<ApiDocument>(`/api/documents/${order.documentId}`);
      setPrintDetail(detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el detalle del pedido');
      setPrintOrder(null);
    } finally {
      setPrintLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full gap-lg">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-md relative z-10">
        <div className="flex flex-col gap-sm">
          <p className="font-label-md text-label-md text-primary tracking-widest uppercase">Operaciones</p>
          <h1 className="font-display-lg text-display-lg text-on-surface">Gestión de Pedidos Públicos</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-[672px]">Administre y procese las órdenes entrantes desde la plataforma pública de clientes.</p>
        </div>
        <div className="flex gap-md flex-wrap">
          <button
            onClick={() => onNavigate('portal-clientes')}
            className="h-10 px-md flex items-center gap-sm bg-surface text-primary border border-outline-variant hover:bg-surface-container-low transition-colors rounded-lg font-label-md cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">storefront</span>
            Ver Portal de Clientes
          </button>
          <button
            onClick={() => onNavigate('nuevo-pedido-manual')}
            className="h-10 px-md flex items-center gap-sm bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-sm rounded-lg font-label-md cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Nuevo Pedido Manual
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-sm bg-error-container/40 border border-error/30 rounded-xl px-md py-sm">
          <span className="material-symbols-outlined text-[18px] text-error">error</span>
          <p className="font-body-md text-body-md text-on-error-container">{error}</p>
        </div>
      )}

      {/* Key Metrics Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-md mb-lg">
        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm flex flex-col gap-md relative overflow-hidden group hover:shadow-md transition-shadow border border-outline-variant/20">
          <div className="absolute top-0 right-0 w-32 h-32 bg-secondary-container/10 rounded-bl-full -mr-8 -mt-8 pointer-events-none"></div>
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
              <span className="material-symbols-outlined">hourglass_top</span>
            </div>
            {newDelta !== null && (
              <span className="font-label-md text-on-surface-variant bg-surface-container py-1 px-2 rounded-md">
                {newDelta >= 0 ? '+' : ''}{newDelta}% vs ayer
              </span>
            )}
          </div>
          <div>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-sm">Pendientes Nuevos</p>
            <p className="font-display-lg text-display-lg text-on-surface">{pendingNew}</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm flex flex-col gap-md relative overflow-hidden group hover:shadow-md transition-shadow border border-outline-variant/20">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-full bg-surface-variant text-on-surface flex items-center justify-center">
              <span className="material-symbols-outlined">local_shipping</span>
            </div>
          </div>
          <div>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-sm">Por Procesar</p>
            <p className="font-display-lg text-display-lg text-on-surface">{inProgress}</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm flex flex-col gap-md relative overflow-hidden group hover:shadow-md transition-shadow border border-outline-variant/20">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
              <span className="material-symbols-outlined">check_circle</span>
            </div>
          </div>
          <div>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-sm">Enviados</p>
            <p className="font-display-lg text-display-lg text-on-surface">{shipped}</p>
          </div>
        </div>

        <div className="bg-primary rounded-xl p-lg shadow-sm flex flex-col gap-sm text-on-primary justify-between relative overflow-hidden">
          <p className="font-label-md text-label-md text-on-primary/80 uppercase tracking-wider">Volumen Semanal</p>
          <div className="h-16 w-full flex items-end gap-1 mt-auto">
            {weekDays.map((d) => {
              const pct = d.count === 0 ? 0 : Math.max(6, (d.count / weeklyMax) * 100);
              return (
                <div
                  key={d.key}
                  title={`${d.label}: ${d.count} pedidos`}
                  className={`w-1/6 rounded-t-sm ${d.label === 'Hoy' ? 'bg-on-primary' : 'bg-on-primary/40'} relative`}
                  style={{ height: `${pct}%` }}
                >
                  {d.label === 'Hoy' && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono-sm text-mono-sm text-on-primary bg-primary-container px-2 py-1 rounded whitespace-nowrap">
                      Hoy
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {orders.length === 0 && (
            <span className="font-body-md text-body-md text-on-primary/80">Sin pedidos esta semana.</span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm flex flex-col flex-1 overflow-hidden border border-outline-variant/20">
        {/* Filter Bar */}
        <div className="p-md border-b border-outline-variant/30 flex flex-col md:flex-row gap-md items-center justify-between bg-surface-container-lowest">
          <div className="relative w-full md:w-80">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar cliente, ID..."
              className="w-full h-10 pl-10 pr-4 bg-surface rounded-lg text-body-md text-on-surface border border-outline-variant focus:outline-none focus:border-primary transition-all"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-lowest border-b border-outline-variant/50 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                <th className="py-md px-md font-semibold">ID Pedido</th>
                <th className="py-md px-md font-semibold">Cliente</th>
                <th className="py-md px-md font-semibold">Fecha</th>
                <th className="py-md px-md font-semibold text-right">Total</th>
                <th className="py-md px-md font-semibold text-center">Estado Pago</th>
                <th className="py-md px-md font-semibold text-center">Estado Logística</th>
                <th className="py-md px-md font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 bg-surface-container-lowest text-body-md text-on-surface">
              {filteredOrders.map((ord) => {
                const next = NEXT_STATUS[ord.logisticsStatus];
                const busy = actionId === ord.documentId;
                return (
                <tr key={ord.id} className="hover:bg-surface-container-low/50 transition-colors group">
                  <td className="py-sm px-md font-mono-sm font-bold text-primary">{ord.id}</td>
                  <td className="py-sm px-md">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                        {ord.client.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-on-surface truncate max-w-[30vw] sm:max-w-[150px]">{ord.client}</span>
                        <span className="text-xs text-on-surface-variant">{ord.clientType}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-sm px-md text-on-surface-variant">{ord.date}</td>
                  <td className="py-sm px-md text-right font-mono-sm font-medium">${ord.total.toFixed(2)}</td>
                  <td className="py-sm px-md text-center">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        ord.paymentStatus === 'Pagado'
                          ? 'bg-tertiary-container/10 text-on-tertiary-container border border-tertiary-container/20'
                          : 'bg-error-container text-on-error-container'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${ord.paymentStatus === 'Pagado' ? 'bg-on-tertiary-container' : 'bg-error'}`}></span>
                      {ord.paymentStatus}
                    </span>
                  </td>
                  <td className="py-sm px-md text-center">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${LOGISTICS_STYLES[ord.logisticsStatus] ?? LOGISTICS_STYLES.Nuevo}`}
                    >
                      {ord.logisticsStatus}
                    </span>
                  </td>
                  <td className="py-sm px-md text-right">
                    <div className="flex justify-end gap-2 opacity-100 transition-opacity">
                      <button onClick={() => void openPrint(ord)} className="w-8 h-8 rounded flex items-center justify-center hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors cursor-pointer tap-target" title="Imprimir pedido">
                        <span className="material-symbols-outlined text-[18px]">print</span>
                      </button>
                      {next && (
                        <button onClick={() => handleAdvance(ord)} disabled={busy} className="h-8 px-sm rounded flex items-center gap-1 hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors cursor-pointer tap-target disabled:opacity-50 font-label-md text-xs" title={next.label}>
                          <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                          <span className="hidden xl:inline">{busy ? 'Guardando...' : next.label}</span>
                        </button>
                      )}
                      {ord.logisticsStatus !== 'Enviado' && ord.logisticsStatus !== 'Anulado' && (
                        <button onClick={() => handleAnular(ord)} disabled={busy} className="w-8 h-8 rounded flex items-center justify-center hover:bg-error-container text-on-surface-variant hover:text-error transition-colors cursor-pointer tap-target disabled:opacity-50" title="Anular pedido">
                          <span className="material-symbols-outlined text-[18px]">cancel</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print modal: detalle imprimible del pedido + window.print() */}
      {printOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 p-md" role="dialog" aria-modal="true" aria-label={`Pedido ${printOrder.id}`}>
          <div className="bg-surface-container-lowest rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-md border-b border-outline-variant/30 print:hidden">
              <h2 className="font-headline-md text-headline-md">Pedido {printOrder.id}</h2>
              <button onClick={() => setPrintOrder(null)} className="p-sm hover:bg-surface-container-high rounded-lg transition-colors cursor-pointer" aria-label="Cerrar">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            {printLoading || !printDetail ? (
              <p className="p-lg text-center text-on-surface-variant">Cargando detalle...</p>
            ) : (
              <div className="print-order p-lg flex flex-col gap-md text-on-surface">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant">Pedido</p>
                    <p className="font-headline-lg text-headline-lg">{printOrder.id}</p>
                    <p className="font-body-md text-body-md text-on-surface-variant">{printOrder.date}</p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${LOGISTICS_STYLES[printOrder.logisticsStatus] ?? ''}`}>
                    {printOrder.logisticsStatus}
                  </span>
                </div>
                <div className="border-t border-outline-variant/30 pt-md">
                  <p className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant mb-sm">Cliente</p>
                  <p className="font-body-md text-body-md font-semibold">{printDetail.client?.name ?? printOrder.client}</p>
                </div>
                <div className="border-t border-outline-variant/30 pt-md">
                  <p className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant mb-sm">Ítems</p>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-on-surface-variant font-label-md text-label-md uppercase">
                        <th className="py-xs pr-sm">Producto</th>
                        <th className="py-xs pr-sm text-right">Cant.</th>
                        <th className="py-xs text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printDetail.items.map((i) => (
                        <tr key={i.id} className="border-t border-outline-variant/20">
                          <td className="py-xs pr-sm">{i.description}</td>
                          <td className="py-xs pr-sm text-right">{Number(i.quantity)}</td>
                          <td className="py-xs text-right">${Number(i.lineTotal).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-outline-variant/30 pt-md flex justify-between font-headline-md text-headline-md">
                  <span>Total</span>
                  <span>${Number(printDetail.total).toFixed(2)}</span>
                </div>
                {printDetail.notes && (
                  <p className="font-body-md text-body-md text-on-surface-variant">Notas: {printDetail.notes}</p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-sm p-md border-t border-outline-variant/30 print:hidden">
              <button onClick={() => setPrintOrder(null)} className="px-md py-sm rounded-lg border border-outline-variant font-label-md text-label-md cursor-pointer">
                Cerrar
              </button>
              <button onClick={() => window.print()} disabled={printLoading || !printDetail} className="px-md py-sm rounded-lg bg-primary text-on-primary font-label-md text-label-md flex items-center gap-sm cursor-pointer disabled:opacity-50">
                <span className="material-symbols-outlined text-[18px]">print</span>
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
