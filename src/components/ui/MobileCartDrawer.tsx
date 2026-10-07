import React, { useEffect } from 'react';

/** Barra fija inferior (mobile) que abre el drawer de carrito. */
export function MobileFloatingBar({
  count,
  total,
  onClick,
}: {
  count: number;
  total: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-primary text-on-primary px-lg py-md font-label-md text-label-md flex items-center justify-between shadow-[0_-4px_15px_rgba(0,0,0,0.15)] cursor-pointer"
    >
      <span className="flex items-center gap-sm">
        <span className="material-symbols-outlined text-[20px]">shopping_cart</span>
        Ver pedido ({count})
      </span>
      <span className="font-headline-md text-headline-md">{total}</span>
    </button>
  );
}

/**
 * Overlay mobile de pantalla completa (con scroll-lock) para el carrito.
 * Content libre vía children; el contenedor interior lleva layout base y
 * bodyClassName solo agrega padding/fondo del consumidor.
 */
export function MobileCartDrawer({
  open,
  title,
  onClose,
  closeLabel,
  children,
  bodyClassName = '',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center justify-between px-lg py-md bg-primary text-on-primary shrink-0">
        <h2 className="font-headline-md text-headline-md">{title}</h2>
        <button
          onClick={onClose}
          className="p-sm hover:bg-on-primary/10 rounded-lg transition-colors cursor-pointer tap-target"
          aria-label={closeLabel ?? `Cerrar ${title}`}
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClassName}`}>{children}</div>
    </div>
  );
}