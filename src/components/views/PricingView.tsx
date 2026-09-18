import React, { useEffect, useState } from 'react';
import { ViewPath, BillingPlan } from '../../types';
import { apiFetch } from '../../lib/api';

interface PricingViewProps {
  onNavigate: (view: ViewPath) => void;
}

export const PricingView: React.FC<PricingViewProps> = ({ onNavigate }) => {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch<BillingPlan[]>('/api/billing/plans', { auth: false })
      .then((catalog) => {
        if (!cancelled) setPlans(catalog);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar los planes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-surface relative overflow-x-clip overflow-y-auto">
      {/* Decorative gradient blurs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10 max-w-[1080px] mx-auto px-lg py-xl flex flex-col gap-xl">
        {/* Header nav */}
        <div className="flex items-center justify-between gap-md flex-wrap">
          <div className="flex items-center gap-sm">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-on-primary font-bold text-headline-md shadow-md">
              N
            </div>
            <span className="font-display-md text-headline-md text-on-surface">Nexus ERP</span>
          </div>
          <div className="flex items-center gap-sm flex-wrap">
            <button
              onClick={() => onNavigate('auth-login')}
              className="px-md py-xs rounded-lg font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => onNavigate('auth-register')}
              className="px-md py-xs rounded-lg bg-primary text-on-primary font-label-md text-label-md shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              Crear cuenta
            </button>
          </div>
        </div>

        {/* Hero */}
        <div className="text-center flex flex-col items-center gap-sm py-lg">
          <span className="font-label-md text-label-md text-primary tracking-widest uppercase">SaaS ERP Multi-tenant</span>
          <h1 className="font-display-lg text-display-lg text-on-surface max-w-[640px]">
            Un ERP completo que crece con tu empresa
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-[560px]">
            Comprobantes, stock, POS, compras y finanzas en una sola plataforma. Comenzá gratis y escalá cuando lo necesites.
          </p>
        </div>

        {error && (
          <p className="text-center text-sm text-on-error-container bg-error-container/20 rounded-lg p-sm max-w-[560px] mx-auto">
            {error}
          </p>
        )}
        {loading && (
          <div className="flex items-center justify-center gap-sm text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin">progress_activity</span>
            Cargando planes...
          </div>
        )}

        {/* Plans */}
        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-md items-stretch">
            {plans.map((p) => {
              const isFree = p.priceMonthly === 0;
              const isPro = p.code === 'pro';
              return (
                <div
                  key={p.code}
                  className={`p-lg rounded-2xl border flex flex-col gap-md ${
                    isPro
                      ? 'border-primary bg-primary-container/10 shadow-lg'
                      : 'border-outline-variant/30 bg-surface-container-lowest'
                  }`}
                >
                  <div>
                    <p className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant">{p.name}</p>
                    <p className="font-display-md text-display-md text-on-surface mt-xs">
                      USD {p.priceMonthly}
                      <span className="text-sm text-on-surface-variant font-body-md"> /mes</span>
                    </p>
                  </div>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{p.description}</p>
                  <ul className="space-y-sm text-sm text-on-surface-variant flex-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-xs">
                        <span className="material-symbols-outlined text-[18px] text-primary">check_circle</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => onNavigate(isFree ? 'auth-register' : 'pricing')}
                    className={`w-full px-md py-sm rounded-lg font-label-md text-label-md transition-colors cursor-pointer ${
                      isFree || isPro
                        ? 'bg-primary text-on-primary hover:shadow-md'
                        : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                    }`}
                  >
                    {isFree ? 'Comenzar gratis' : isPro ? 'Elegir Profesional' : 'Contactar ventas'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-on-surface-variant">
          Pagos recurrentes procesados por Mercado Pago. Podés cancelar cuando quieras.
        </p>
      </div>
    </div>
  );
};