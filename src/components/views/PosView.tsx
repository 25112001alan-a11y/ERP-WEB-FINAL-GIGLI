import React, { useState } from 'react';
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
  const [cart, setCart] = useState<CartItem[]>([
    { product: products[4] || products[0], quantity: 2 },
    { product: products[3] || products[1], quantity: 1 },
  ]);
  const [clientName, setClientName] = useState('Consumidor Final');
  const [saleCompleted, setSaleCompleted] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

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
  const tax = subtotal * 0.12;
  const total = subtotal + tax;

  const handleCheckout = async (method: string) => {
    if (cart.length === 0 || checkingOut) return;
    setCheckingOut(true);
    setSaleError(null);
    try {
      await onCompleteSale({ items: cart, method, clientName });
      setSaleCompleted(true);
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

  return (
    <div className="flex flex-col w-full h-full max-h-screen -m-lg">
      <div className="flex flex-1 overflow-hidden h-[calc(100vh-64px)]">
        {/* Left Panel: Product Search & Grid */}
        <div className="flex-1 flex flex-col bg-surface overflow-hidden">
          {/* Category & Search Bar */}
          <div className="p-lg bg-surface flex flex-col gap-md shrink-0 shadow-sm z-10 border-b border-outline-variant/20">
            <div className="flex items-center gap-md">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">search</span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar producto por nombre o código de barras (F2)"
                  className="w-full bg-surface-container-low rounded-xl py-md pl-12 pr-md font-body-lg text-body-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary shadow-inner transition-shadow"
                />
              </div>
              <button className="w-12 h-12 bg-surface-container-high text-on-surface flex items-center justify-center rounded-xl hover:bg-surface-variant transition-colors shadow-sm">
                <span className="material-symbols-outlined">barcode_scanner</span>
              </button>
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-sm overflow-x-auto pb-sm no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-md py-sm rounded-full font-label-md text-label-md whitespace-nowrap transition-all cursor-pointer ${
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
          <div className="flex-1 overflow-y-auto p-lg bg-surface-container-lowest">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-md">
              {filteredProducts.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  className={`group flex flex-col bg-surface rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer transform hover:-translate-y-1 border border-outline-variant/20 ${
                    prod.stock <= 0 ? 'opacity-50 cursor-not-allowed grayscale' : ''
                  }`}
                >
                  <div className="aspect-square relative bg-surface-container-low p-md flex items-center justify-center">
                    {prod.imageUrl ? (
                      <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-contain mix-blend-multiply" />
                    ) : (
                      <span className="material-symbols-outlined text-[40px] text-outline opacity-40">inventory_2</span>
                    )}
                    <span
                      className={`absolute top-sm right-sm px-sm py-xs rounded font-mono-sm text-mono-sm font-bold ${
                        prod.stock <= 0
                          ? 'bg-error text-on-error'
                          : 'bg-surface/80 backdrop-blur text-on-surface'
                      }`}
                    >
                      {prod.stock} un.
                    </span>
                  </div>
                  <div className="p-md flex flex-col gap-xs bg-surface-container-lowest flex-1">
                    <span className="font-body-md text-body-md text-on-surface line-clamp-2 leading-tight font-medium">
                      {prod.name}
                    </span>
                    <div className="flex items-end justify-between mt-auto pt-sm">
                      <span className="font-headline-md text-headline-md text-primary font-bold">
                        ${prod.price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel: Cart */}
        <div className="w-96 lg:w-[420px] bg-surface flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.05)] z-20 border-l border-outline-variant/30">
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
          <div className="flex-1 overflow-y-auto bg-surface p-md flex flex-col gap-sm">
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
                  <div className="flex items-center gap-xs bg-surface-container-low rounded-full px-sm py-xs">
                    <button
                      onClick={() => updateQuantity(item.product.id, -1)}
                      className="w-6 h-6 rounded-full hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">remove</span>
                    </button>
                    <span className="font-mono-sm text-mono-sm text-on-surface font-bold w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product.id, 1)}
                      className="w-6 h-6 rounded-full hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                    </button>
                  </div>
                  <div className="w-16 text-right font-body-lg text-body-lg text-on-surface font-bold">
                    ${(item.product.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals & Payment Grid */}
          <div className="bg-surface-container-highest p-lg shadow-[0_-4px_15px_rgba(0,0,0,0.05)] rounded-t-2xl z-20 flex flex-col gap-md">
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
                <span className="font-body-md text-body-md text-on-surface-variant">IVA (12%)</span>
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
                className="w-12 h-12 rounded-xl bg-error-container text-on-error-container flex items-center justify-center hover:bg-error hover:text-on-error transition-colors shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined">delete</span>
              </button>
              <button
                onClick={() => handleCheckout('Efectivo')}
                disabled={checkingOut}
                className="flex-1 rounded-xl bg-secondary text-on-secondary flex items-center justify-center font-label-md text-label-md uppercase tracking-wider shadow-md hover:shadow-lg transition-all cursor-pointer py-3 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {checkingOut ? 'Procesando...' : `Cobrar ${total.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
