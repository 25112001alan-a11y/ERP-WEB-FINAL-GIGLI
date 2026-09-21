import React, { useEffect, useState } from 'react';
import { ViewPath, Product, CartItem, SaleTransaction } from '../../types';

export interface CompleteSalePayload {
  items: CartItem[];
  method: string;
  clientName: string;
}

interface PosViewProps {
  products: Product[];
  onCompleteSale: (payload: CompleteSalePayload) => Promise<SaleTransaction>;
  onNavigate: (view: ViewPath) => void;
}

export const PosView: React.FC<PosViewProps> = ({ products, onCompleteSale, onNavigate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientName, setClientName] = useState('Consumidor Final');
  const [saleCompleted, setSaleCompleted] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  // Modal states for checkout
  const [cashModal, setCashModal] = useState<{ open: boolean; received: string }>({ open: false, received: '' });
  const [splitModal, setSplitModal] = useState<{ open: boolean; rows: { method: string; amount: string }[] }>({ open: false, rows: [{ method: 'Efectivo', amount: '' }, { method: 'Tarjeta', amount: '' }] });

  // Bloquear el scroll de fondo mientras el carrito mobile está abierto.
  useEffect(() => {
    document.body.style.overflow = cartOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [cartOpen]);

  const categories = ['Todos', 'Electrónica', 'Ropa', 'Muebles', 'Bebidas', 'Snacks'];

  const filteredProducts = products.filter((prod) => {
    const matchesSearch = prod.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prod.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'Todos' || prod.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const tax = cart.reduce(
    (acc, item) => acc + item.product.price * item.quantity * (item.product.taxRate / 100),
    0,
  );
  const total = subtotal + tax;

  const handleCheckout = async (method: string) => {
    if (cart.length === 0 || checkingOut) return;

    // Efectivo: open modal to ask for amount received
    if (method === 'Efectivo') {
      setCashModal({ open: true, received: total.toFixed(2) });
      return;
    }

    // Dividir Pago: open split payment modal
    if (method === 'Dividir Pago') {
      setSplitModal({ open: true, rows: [{ method: 'Efectivo', amount: '' }, { method: 'Tarjeta', amount: '' }] });
      return;
    }

    // Tarjeta / QR / Transf.: mock payment, create VENTA with status 'Pagado'
    setCheckingOut(true);
    setSaleError(null);
    try {
      await onCompleteSale({ items: cart, method, clientName });
      setSaleCompleted(true);
      setCartOpen(false);
      setTimeout(() => {
        setCart([]);
        setSaleCompleted(false);
      }, 1800);
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : 'No se pudo completar la venta');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleCashConfirm = async () => {
    const received = parseFloat(cashModal.received);
    if (isNaN(received) || received < total) {
      setSaleError('El monto recibido debe ser mayor o igual al total');
      return;
    }
    const change = received - total;
    setCashModal({ open: false, received: '' });
    setCheckingOut(true);
    setSaleError(null);
    try {
      // Use onCompleteSale which creates VENTA document with payment
      await onCompleteSale({ items: cart, method: 'Efectivo', clientName });
      setSaleCompleted(true);
      setCartOpen(false);
      // TODO: show change to user (toast)
      console.log('Vuelto:', change.toFixed(2));
      setTimeout(() => {
        setCart([]);
        setSaleCompleted(false);
      }, 1800);
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : 'No se pudo completar la venta');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleSplitConfirm = async () => {
    const sum = splitModal.rows.reduce((acc, r) => acc + parseFloat(r.amount || '0'), 0);
    if (Math.abs(sum - total) > 0.01) {
      setSaleError('La suma de los pagos debe ser igual al total');
      return;
    }
    if (splitModal.rows.some((r) => !r.method || !r.amount || parseFloat(r.amount) <= 0)) {
      setSaleError('Completa todos los métodos y montos');
      return;
    }
    setSplitModal({ open: false, rows: [] });
    setCheckingOut(true);
    setSaleError(null);
    try {
      // For now, create VENTA with first payment method; multiple payments would need backend support
      const primaryMethod = splitModal.rows[0].method;
      await onCompleteSale({ items: cart, method: primaryMethod, clientName });
      // TODO: backend supports multiple payments per document (Payment[] relation)
      console.log('Pago dividido:', splitModal.rows);
      setSaleCompleted(true);
      setCartOpen(false);
      setTimeout(() => {
        setCart([]);
        setSaleCompleted(false);
      }, 1800);
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : 'No se pudo completar la venta');
    } finally {
      setCheckingOut(false);
    }
  };

  const addSplitRow = () => {
    setSplitModal((prev) => ({ ...prev, rows: [...prev.rows, { method: 'Efectivo', amount: '' }] }));
  };

  const removeSplitRow = (idx: number) => {
    setSplitModal((prev) => ({ ...prev, rows: prev.rows.filter((_, i) => i !== idx) }));
  };

  const updateSplitRow = (idx: number, field: 'method' | 'amount', value: string) => {
    setSplitModal((prev) => ({
      ...prev,
      rows: prev.rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    }));
  };

  // Cuerpo del carrito — compartido entre desktop (panel fijo) y mobile (overlay).
  const cartBody = (
    <>
      {/* Customer Info */}
      <div className="p-md bg-surface-container-lowest border-b border-surface-container-high shadow-sm z-10 flex flex-col gap-sm">
        <div className="flex items-center justify-between">
          <span className="font-label-md text-label-md text-outline uppercase tracking-wider">Cliente Actual</span>
          <button className="text-secondary font-label-md text-label-md hover:underline cursor-pointer">
            Nuevo Cliente
          </button>
        </div>
        <div className="flex items-center bg-surface-container-low rounded-xl p-sm shadow-inner group">
          <span className="material-symbols-outlined text-outline px-sm">person_search</span>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="bg-transparent border-none w-full font-body-lg text-body-lg text-on-surface focus:outline-none"
          />
        </div>
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto bg-surface p-md flex flex-col gap-sm min-h-0">
        {saleCompleted ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-md">
            <div className="w-16 h-16 bg-tertiary-container text-on-tertiary-container rounded-full flex items-center justify-center mb-md">
              <span className="material-symbols-outlined text-[36px]">check_circle</span>
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface">¡Venta Completada!</h3>
            <p className="font-body-md text-on-surface-variant mt-xs">Comprobante generado exitosamente.</p>
          </div>
        ) : cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-outline p-md">
            <span className="material-symbols-outlined text-[48px] mb-sm opacity-40">shopping_cart</span>
            <p className="font-body-lg text-body-lg">El carrito está vacío</p>
            <p className="font-body-md text-xs">Selecciona un producto del catálogo para comenzar</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.product.id} className="flex items-center gap-md bg-surface-container-lowest p-md rounded-xl shadow-sm border border-outline-variant/20">
              <div className="w-12 h-12 rounded-lg bg-surface-container-low flex items-center justify-center shrink-0 overflow-hidden">
                {item.product.imageUrl ? (
                  <img src={item.product.imageUrl} alt={item.product.name} className="w-full h-full object-cover mix-blend-multiply" />
                ) : (
                  <span className="material-symbols-outlined text-outline">inventory_2</span>
                )}
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <span className="font-body-md text-body-md text-on-surface font-semibold truncate">{item.product.name}</span>
                <span className="font-mono-sm text-mono-sm text-outline">${item.product.price.toFixed(2)} c/u</span>
              </div>
              <div className="flex items-center gap-xs bg-surface-container-low rounded-full px-sm py-xs shrink-0">
                <button
                  onClick={() => updateQuantity(item.product.id, -1)}
                  aria-label={`Quitar una unidad de ${item.product.name}`}
                  className="w-7 h-7 rounded-full hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors cursor-pointer tap-target"
                >
                  <span className="material-symbols-outlined text-[16px]">remove</span>
                </button>
                <span className="font-mono-sm text-mono-sm text-on-surface font-bold w-6 text-center">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.product.id, 1)}
                  aria-label={`Agregar una unidad de ${item.product.name}`}
                  className="w-7 h-7 rounded-full hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors cursor-pointer tap-target"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </button>
              </div>
              <div className="text-right font-body-lg text-body-lg text-on-surface font-bold shrink-0">
                ${(item.product.price * item.quantity).toFixed(2)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals & Payment Grid */}
      <div className="bg-surface-container-highest p-lg shadow-[0_-4px_15px_rgba(0,0,0,0.05)] rounded-t-2xl z-20 flex flex-col gap-md shrink-0">
        <div className="flex flex-col gap-sm border-b border-outline-variant/30 pb-md">
          <div className="flex justify-between items-center">
            <span className="font-body-md text-body-md text-on-surface-variant">Subtotal</span>
            <span className="font-mono-sm text-mono-sm text-on-surface">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-error">
            <span className="font-body-md text-body-md flex items-center gap-xs cursor-pointer hover:underline">
              <span className="material-symbols-outlined text-[16px]">high_res</span> Descuento (0%)
            </span>
            <span className="font-mono-sm text-mono-sm">-$0.00</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-body-md text-body-md text-on-surface-variant">Impuestos (IVA)</span>
            <span className="font-mono-sm text-mono-sm text-on-surface">${tax.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex justify-between items-end pb-sm">
          <span className="font-headline-md text-headline-md text-on-surface font-light uppercase tracking-widest">Total</span>
          <span className="font-display-lg text-display-lg text-primary font-bold leading-none">${total.toFixed(2)}</span>
        </div>

        {saleError && (
          <div className="bg-error-container text-on-error-container rounded-xl px-md py-sm font-body-md text-body-md">
            {saleError}
          </div>
        )}

        {/* Payment Buttons Grid */}
        <div className="grid grid-cols-2 gap-sm">
          <button
            onClick={() => handleCheckout('Efectivo')}
            className="bg-primary text-on-primary rounded-xl p-md flex flex-col items-center justify-center gap-xs shadow-md hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
            <span className="font-label-md text-label-md">Efectivo</span>
          </button>
          <button
            onClick={() => handleCheckout('Tarjeta Crédito')}
            className="bg-surface-container-lowest text-on-surface rounded-xl p-md flex flex-col items-center justify-center gap-xs shadow-sm hover:shadow-md transition-all border border-surface-container-high hover:-translate-y-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[28px]">credit_card</span>
            <span className="font-label-md text-label-md">Tarjeta</span>
          </button>
          <button
            onClick={() => handleCheckout('QR / Transf.')}
            className="bg-surface-container-lowest text-on-surface rounded-xl p-md flex flex-col items-center justify-center gap-xs shadow-sm hover:shadow-md transition-all border border-surface-container-high hover:-translate-y-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[28px]">qr_code_scanner</span>
            <span className="font-label-md text-label-md">QR / Transf.</span>
          </button>
          <button
            onClick={() => handleCheckout('Dividir Pago')}
            className="bg-surface-container-lowest text-on-surface rounded-xl p-md flex flex-col items-center justify-center gap-xs shadow-sm hover:shadow-md transition-all border border-surface-container-high hover:-translate-y-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[28px]">splitscreen</span>
            <span className="font-label-md text-label-md">Dividir Pago</span>
          </button>
        </div>

        <div className="flex gap-sm pt-xs">
          <button
            onClick={clearCart}
            title="Limpiar Carrito"
            className="w-12 h-12 rounded-xl bg-error-container text-on-error-container flex items-center justify-center hover:bg-error hover:text-on-error transition-colors shadow-sm cursor-pointer shrink-0 tap-target"
          >
            <span className="material-symbols-outlined">delete</span>
          </button>
          <button
            onClick={() => handleCheckout('Efectivo')}
            disabled={checkingOut}
            className="flex-1 rounded-xl bg-secondary text-on-secondary flex items-center justify-center font-label-md text-label-md uppercase tracking-wider shadow-md hover:shadow-lg transition-all cursor-pointer py-3 disabled:opacity-60 disabled:cursor-not-allowed min-w-0"
          >
            {checkingOut ? 'Procesando...' : `Cobrar ${total.toFixed(2)}`}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex flex-col w-full h-full max-h-dvh">
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* Left Panel: Product Search & Grid */}
        <div className="flex-1 flex flex-col bg-surface overflow-hidden min-h-0 pb-24 lg:pb-0">
          {/* Category & Search Bar */}
          <div className="p-lg bg-surface flex flex-col gap-md shrink-0 shadow-sm z-10 border-b border-outline-variant/20">
            <div className="flex items-center gap-md">
              <div className="relative flex-1 min-w-0">
                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">search</span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar producto por nombre o código de barras (F2)"
                  className="w-full bg-surface-container-low rounded-xl py-md pl-12 pr-md font-body-lg text-body-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary shadow-inner transition-shadow"
                />
              </div>
              <button className="w-12 h-12 bg-surface-container-high text-on-surface flex items-center justify-center rounded-xl hover:bg-surface-variant transition-colors shadow-sm shrink-0 tap-target">
                <span className="material-symbols-outlined">barcode_scanner</span>
              </button>
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-sm overflow-x-auto pb-sm no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-md py-sm rounded-full font-label-md text-label-md whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                    selectedCategory === cat
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container-high text-on-surface hover:bg-surface-variant'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-lg bg-surface-container-lowest min-h-[400px]">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-sm">
              {filteredProducts.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  className={`group flex flex-col bg-surface rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer transform hover:-translate-y-1 border border-outline-variant/20 ${
                    prod.stock <= 0 ? 'opacity-50 cursor-not-allowed grayscale' : ''
                  }`}
                >
                  <div className="aspect-square relative bg-surface-container-low p-sm flex items-center justify-center">
                    {prod.imageUrl ? (
                      <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-contain mix-blend-multiply" />
                    ) : (
                      <span className="material-symbols-outlined text-[32px] text-outline opacity-40">inventory_2</span>
                    )}
                    <span
                      className={`absolute top-sm right-sm px-sm py-xs rounded font-mono-xs text-mono-xs font-bold ${
                        prod.stock <= 0
                          ? 'bg-error text-on-error'
                          : 'bg-surface/80 backdrop-blur text-on-surface'
                      }`}
                    >
                      {prod.stock} un.
                    </span>
                  </div>
                  <div className="p-sm flex flex-col gap-xs bg-surface-container-lowest flex-1">
                    <span className="font-body-sm text-body-sm text-on-surface line-clamp-2 leading-tight font-medium">
                      {prod.name}
                    </span>
                    <div className="flex items-end justify-between mt-auto pt-xs">
                      <span className="font-headline-sm text-headline-sm text-primary font-bold">
                        ${prod.price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel: Cart (desktop) */}
        <div className="hidden lg:flex w-[420px] bg-surface flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.05)] z-20 border-l border-outline-variant/30 min-h-0">
          {cartBody}
        </div>
      </div>

      {/* Mobile: barra flotante de resumen + overlay de carrito */}
      {cart.length > 0 && !saleCompleted && (
        <button
          onClick={() => setCartOpen(true)}
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-primary text-on-primary px-lg py-md font-label-md text-label-md flex items-center justify-between shadow-[0_-4px_15px_rgba(0,0,0,0.15)] cursor-pointer"
        >
          <span className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-[20px]">shopping_cart</span>
            Ver pedido ({cart.length})
          </span>
          <span className="font-headline-md text-headline-md">${total.toFixed(2)}</span>
        </button>
      )}

      {cartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label="Carrito de venta">
          <div className="flex items-center justify-between px-lg py-md bg-primary text-on-primary shrink-0">
            <h2 className="font-headline-md text-headline-md">Carrito de Venta</h2>
            <button
              onClick={() => setCartOpen(false)}
              className="p-sm hover:bg-on-primary/10 rounded-lg transition-colors cursor-pointer tap-target"
              aria-label="Cerrar carrito"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            {cartBody}
          </div>
        </div>
      )}

      {/* Cash Received Modal */}
      {cashModal.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" onClick={() => setCashModal({ open: false, received: '' })}>
          <div className="bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-sm p-lg border border-outline-variant/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Pago en Efectivo</h3>
            <p className="font-body-md text-on-surface-variant mb-md">Total: <span className="font-bold text-primary">${total.toFixed(2)}</span></p>
            <div className="flex flex-col gap-sm mb-md">
              <label className="font-label-md text-label-md text-on-surface-variant">Monto recibido</label>
              <input
                type="number"
                step="0.01"
                min={total}
                value={cashModal.received}
                onChange={(e) => setCashModal({ ...cashModal, received: e.target.value })}
                className="w-full bg-surface border border-outline-variant/50 rounded-lg px-md py-sm font-body-lg text-body-lg focus:ring-2 focus:ring-primary outline-none"
                autoFocus
              />
            </div>
            <p className="font-body-md text-on-surface-variant mb-md">Vuelto: <span className="font-bold">${(parseFloat(cashModal.received) - total).toFixed(2)}</span></p>
            <div className="flex gap-sm justify-end">
              <button onClick={() => setCashModal({ open: false, received: '' })} className="px-md py-sm rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer">Cancelar</button>
              <button onClick={handleCashConfirm} disabled={checkingOut} className="px-md py-sm rounded-lg bg-primary text-on-primary hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Split Payment Modal */}
      {splitModal.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" onClick={() => setSplitModal({ open: false, rows: [] })}>
          <div className="bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-md p-lg border border-outline-variant/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Dividir Pago</h3>
            <p className="font-body-md text-on-surface-variant mb-md">Total: <span className="font-bold text-primary">${total.toFixed(2)}</span></p>
            <div className="space-y-sm mb-md max-h-60 overflow-y-auto">
              {splitModal.rows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-sm">
                  <select
                    value={row.method}
                    onChange={(e) => updateSplitRow(idx, 'method', e.target.value)}
                    className="flex-1 bg-surface border border-outline-variant/50 rounded-lg px-md py-sm font-body-md focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Tarjeta">Tarjeta</option>
                    <option value="QR / Transf.">QR / Transf.</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Monto"
                    value={row.amount}
                    onChange={(e) => updateSplitRow(idx, 'amount', e.target.value)}
                    className="w-28 bg-surface border border-outline-variant/50 rounded-lg px-md py-sm font-body-md text-right focus:ring-2 focus:ring-primary outline-none"
                  />
                  {splitModal.rows.length > 2 && (
                    <button onClick={() => removeSplitRow(idx)} className="text-error hover:text-on-error-container p-sm rounded-lg hover:bg-error-container/10 cursor-pointer" aria-label="Eliminar">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="font-body-sm text-on-surface-variant mb-md">Suma: <span className="font-bold ${splitModal.rows.reduce((acc, r) => acc + parseFloat(r.amount || '0'), 0) === total ? 'text-tertiary' : 'text-error'}">${splitModal.rows.reduce((acc, r) => acc + parseFloat(r.amount || '0'), 0).toFixed(2)}</span></p>
            <div className="flex gap-sm justify-between">
              <button onClick={addSplitRow} className="px-md py-sm rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer flex items-center gap-xs">
                <span className="material-symbols-outlined text-[16px]">add</span> Agregar método
              </button>
              <div className="flex gap-sm">
                <button onClick={() => setSplitModal({ open: false, rows: [] })} className="px-md py-sm rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer">Cancelar</button>
                <button onClick={handleSplitConfirm} disabled={checkingOut} className="px-md py-sm rounded-lg bg-primary text-on-primary hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50">Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};