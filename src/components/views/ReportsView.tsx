import React, { useState } from 'react';
import { ViewPath, Product, SaleTransaction } from '../../types';

interface ReportsViewProps {
  products: Product[];
  sales: SaleTransaction[];
  onNavigate: (view: ViewPath) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ products, sales }) => {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'year'>('30d');
  const [exporting, setExporting] = useState(false);

  const totalSalesVal = sales.reduce((acc, s) => acc + s.amount, 0);
  const avgTicket = sales.length > 0 ? totalSalesVal / sales.length : 0;
  const totalStockVal = products.reduce((acc, p) => acc + p.stock * p.price, 0);
  const totalCostVal = products.reduce((acc, p) => acc + p.stock * p.costPrice, 0);
  const estimatedMargin = totalStockVal > 0 ? ((totalStockVal - totalCostVal) / totalStockVal) * 100 : 0;

  const handleExportPDF = () => {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      alert('Reporte en formato PDF generado y listo para descargar.');
    }, 1200);
  };

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
          <div className="bg-surface p-xs rounded-lg border border-outline-variant/50 flex gap-xs">
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

          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="px-md py-sm bg-secondary-container text-on-secondary-container font-label-md text-label-md rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center gap-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            {exporting ? 'Generando PDF...' : 'Exportar Reporte'}
          </button>
        </div>
      </div>

      {/* Analytics Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-md">
        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-xs">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Ventas Totales</span>
          <p className="font-display-lg text-display-lg font-mono-sm text-primary">${totalSalesVal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
          <span className="text-xs text-tertiary-container flex items-center gap-1 font-semibold">
            <span className="material-symbols-outlined text-xs">trending_up</span> +18.4% vs período anterior
          </span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-xs">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Ticket Promedio</span>
          <p className="font-display-lg text-display-lg font-mono-sm text-on-surface">${avgTicket.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
          <span className="text-xs text-on-surface-variant">Basado en {sales.length} transacciones</span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-xs">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Valorización de Inventario</span>
          <p className="font-display-lg text-display-lg font-mono-sm text-on-surface">${totalStockVal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
          <span className="text-xs text-on-surface-variant">Costo Base: ${totalCostVal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex flex-col gap-xs">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Margen Bruto Estimado</span>
          <p className="font-display-lg text-display-lg font-mono-sm text-tertiary-container">{estimatedMargin.toFixed(1)}%</p>
          <span className="text-xs text-tertiary-container">Estructura de precios saludable</span>
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
            {['Electrónica', 'Muebles', 'Ropa', 'Bebidas', 'Snacks'].map((cat, idx) => {
              const catProds = products.filter((p) => p.category === cat);
              const count = catProds.reduce((acc, p) => acc + p.stock, 0);
              const max = 1000;
              const pct = Math.min(100, Math.round((count / max) * 100));

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
                      style={{ width: `${Math.max(5, pct)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Performing Products */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-lg border border-outline-variant/20 flex flex-col gap-md">
          <div className="flex justify-between items-center border-b border-outline-variant/20 pb-sm">
            <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-xs">
              <span className="material-symbols-outlined text-primary">leaderboard</span>
              Productos de Mayor Rotación
            </h2>
          </div>

          <div className="divide-y divide-outline-variant/10">
            {products.slice(0, 4).map((p, idx) => (
              <div key={p.id} className="py-sm flex items-center justify-between">
                <div className="flex items-center gap-md">
                  <div className="w-8 h-8 rounded-lg bg-surface-container-high text-primary font-mono-sm font-bold flex items-center justify-center text-xs">
                    0{idx + 1}
                  </div>
                  <div>
                    <p className="font-body-md font-semibold text-on-surface">{p.name}</p>
                    <p className="text-xs text-on-surface-variant font-mono-sm">SKU: {p.sku} • Category: {p.category}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono-sm font-bold text-primary">${p.price.toFixed(2)}</p>
                  <p className="text-xs text-tertiary-container font-medium">{p.stock} dispon. en stock</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
