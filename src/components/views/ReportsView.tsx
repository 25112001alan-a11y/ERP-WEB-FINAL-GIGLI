import React, { useState } from 'react';
import { ViewPath, Product, SaleTransaction } from '../../types';

interface ReportsViewProps {
  products: Product[];
  sales: SaleTransaction[];
  onNavigate: (view: ViewPath) => void;
}

type Period = '7d' | '30d' | '90d' | 'year';

const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90, year: 365 };
const DAY_MS = 86_400_000;

export const ReportsView: React.FC<ReportsViewProps> = ({ products, sales }) => {
  const [period, setPeriod] = useState<Period>('30d');

  // Ventas filtradas por el período elegido, comparadas contra el período anterior de igual longitud.
  const now = Date.now();
  const days = PERIOD_DAYS[period];
  const windowStart = now - days * DAY_MS;
  const prevStart = now - 2 * days * DAY_MS;

  const salesWithTs = sales
    .map((s) => ({ amount: s.amount, ts: new Date(s.createdAt ?? s.date).getTime() }))
    .filter((s) => !Number.isNaN(s.ts));

  const salesInWindow = salesWithTs.filter((s) => s.ts >= windowStart);
  const salesPrev = salesWithTs.filter((s) => s.ts >= prevStart && s.ts < windowStart);

  const totalSalesVal = salesInWindow.reduce((acc, s) => acc + s.amount, 0);
  const prevSalesVal = salesPrev.reduce((acc, s) => acc + s.amount, 0);
  const avgTicket = salesInWindow.length > 0 ? totalSalesVal / salesInWindow.length : 0;
  const salesDelta = prevSalesVal > 0 ? ((totalSalesVal - prevSalesVal) / prevSalesVal) * 100 : null;

  const totalStockVal = products.reduce((acc, p) => acc + p.stock * p.price, 0);
  const totalCostVal = products.reduce((acc, p) => acc + p.stock * p.costPrice, 0);
  const estimatedMargin = totalStockVal > 0 ? ((totalStockVal - totalCostVal) / totalStockVal) * 100 : 0;

  // Distribución real del inventario por categoría (proporción sobre la categoría con más stock).
  const catCounts = new Map<string, number>();
  products.forEach((p) => catCounts.set(p.category, (catCounts.get(p.category) ?? 0) + p.stock));
  const catEntries = [...catCounts.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const maxCat = catEntries.reduce((m, [, n]) => Math.max(m, n), 0);

  // Ranking real por stock disponible ascendente (lo que conviene reponer primero).
  const lowStockRanking = [...products].sort((a, b) => a.stock - b.stock).slice(0, 4);

  return (
    <div className="flex flex-col w-full h-full gap-lg font-body-md text-on-surface">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-md bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
        <div>
          <span className="font-label-md text-label-md text-primary tracking-widest uppercase">Business Intelligence</span>
          <h1 className="font-display-lg text-display-lg text-on-surface">Reportes y Analítica Avanzada</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Indicadores clave de ventas, margen de rentabilidad y rotación de inventarios.</p>
        </div>
        <div className="flex gap-sm flex-wrap items-center">
          <div className="bg-surface p-xs rounded-lg border border-outline-variant/50 flex gap-xs flex-wrap">
            {(['7d', '30d', '90d', 'year'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-sm py-xs rounded font-label-md text-xs uppercase cursor-pointer transition-colors ${
                  period === p ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {p === '7d' ? '7 Días' : p === '30d' ? '30 Días' : p === '90d' ? 'Trimestre' : 'Año'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Analytics Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-md">
        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-xs">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Ventas Totales</span>
          <p className="font-display-lg text-display-lg font-mono-sm text-primary">${totalSalesVal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
          {salesDelta !== null && (
            <span className={`text-xs flex items-center gap-1 font-semibold ${salesDelta >= 0 ? 'text-tertiary-container' : 'text-error'}`}>
              <span className="material-symbols-outlined text-xs">{salesDelta >= 0 ? 'trending_up' : 'trending_down'}</span>
              {salesDelta >= 0 ? '+' : ''}{salesDelta.toFixed(1)}% vs período anterior
            </span>
          )}
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-xs">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Ticket Promedio</span>
          <p className="font-display-lg text-display-lg font-mono-sm text-on-surface">${avgTicket.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
          <span className="text-xs text-on-surface-variant">Basado en {salesInWindow.length} transacciones</span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-xs">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Valorización de Inventario</span>
          <p className="font-display-lg text-display-lg font-mono-sm text-on-surface">${totalStockVal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
          <span className="text-xs text-on-surface-variant">Costo Base: ${totalCostVal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-xs">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Margen Bruto Estimado</span>
          <p className="font-display-lg text-display-lg font-mono-sm text-tertiary-container">{estimatedMargin.toFixed(1)}%</p>
          <span className="text-xs text-tertiary-container">Sobre el valor de inventario cargado</span>
        </div>
      </div>

      {/* Main Charts & Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg flex-1">
        {/* Visual Bar Chart: Top Category Breakdown */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-lg border border-outline-variant/20 flex flex-col gap-md">
          <div className="flex justify-between items-center border-b border-outline-variant/20 pb-sm">
            <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-xs">
              <span className="material-symbols-outlined text-primary">bar_chart</span>
              Distribución de Inventario por Categoría
            </h2>
          </div>

          <div className="space-y-md flex-1 justify-center flex flex-col">
            {catEntries.map(([cat, count], idx) => {
              const pct = maxCat > 0 ? Math.round((count / maxCat) * 100) : 0;

              return (
                <div key={cat} className="flex flex-col gap-xs">
                  <div className="flex justify-between font-body-md text-xs">
                    <span className="font-semibold text-on-surface">{cat}</span>
                    <span className="text-on-surface-variant font-mono-sm">{count} unidades ({pct}%)</span>
                  </div>
                  <div className="h-3 w-full bg-surface-container-high rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        idx === 0
                          ? 'bg-primary'
                          : idx === 1
                          ? 'bg-secondary'
                          : idx === 2
                          ? 'bg-tertiary-container'
                          : 'bg-primary-container'
                      }`}
                      style={{ width: `${Math.max(pct, 5)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
            {catEntries.length === 0 && (
              <p className="font-body-md text-body-md text-on-surface-variant text-center py-md">Sin productos cargados.</p>
            )}
          </div>
        </div>

        {/* Real ranking: productos con menor stock */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-lg border border-outline-variant/20 flex flex-col gap-md">
          <div className="flex justify-between items-center border-b border-outline-variant/20 pb-sm">
            <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-xs">
              <span className="material-symbols-outlined text-primary">leaderboard</span>
              Productos con Menor Stock
            </h2>
          </div>

          {lowStockRanking.length > 0 ? (
            <div className="divide-y divide-outline-variant/10">
              {lowStockRanking.map((p, idx) => (
                <div key={p.id} className="py-sm flex items-center justify-between">
                  <div className="flex items-center gap-md">
                    <div className="w-8 h-8 rounded-lg bg-surface-container-high text-primary font-mono-sm font-bold flex items-center justify-center text-xs">
                      0{idx + 1}
                    </div>
                    <div>
                      <p className="font-body-md font-semibold text-on-surface">{p.name}</p>
                      <p className="text-xs text-on-surface-variant font-mono-sm">SKU: {p.sku} • {p.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono-sm font-bold text-primary">${p.price.toFixed(2)}</p>
                    <p className="text-xs font-medium">{p.stock} dispon. / mín {p.minStock}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-body-md text-body-md text-on-surface-variant text-center py-md">Sin productos cargados.</p>
          )}
        </div>
      </div>
    </div>
  );
};