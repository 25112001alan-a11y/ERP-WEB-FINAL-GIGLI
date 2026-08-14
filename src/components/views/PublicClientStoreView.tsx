import React, { useState } from 'react';
import { ViewPath, Product, CartItem } from '../../types';

interface PublicClientStoreViewProps {
  products: Product[];
  onNavigate: (view: ViewPath) => void;
}

export const PublicClientStoreView: React.FC<PublicClientStoreViewProps> = ({ products, onNavigate }) => {
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [cart, setCart] = useState<CartItem[]>([
    { product: products[1] || products[0], quantity: 1 },
    { product: products[0] || products[1], quantity: 1 },
  ]);
  const [fullName, setFullName] = useState('Juan Pérez');
  const [phone, setPhone] = useState('+54 9 11 4567 8900');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [orderConfirmed, setOrderCompleted] = useState(false);

  const categories = ['Todos', 'Electrónica', 'Muebles', 'Ropa', 'Bebidas', 'Snacks'];

  const filteredProducts = products.filter((prod) =>
    selectedCategory === 'Todos' ? true : prod.category === selectedCategory
  );

  const addToCart = (product: Product) => {
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

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const subtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const tax = subtotal * 0.21;
  const total = subtotal + tax;

  const handleConfirmOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setOrderCompleted(true);
    setTimeout(() => {
      setCart([]);
      setOrderCompleted(false);
      onNavigate('pedidos-publicos');
    }, 2000);
  };

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface -m-lg">
      {/* Client Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-surface-container-lowest/90 backdrop-blur-md z-50 flex items-center justify-between px-lg border-b border-outline-variant/30">
        <div className="flex items-center gap-md">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-on-primary font-bold text-headline-md">N</div>
          <span className="font-headline-md text-headline-md text-on-surface">Portal de Clientes • Nexus ERP</span>
        </div>
        <button
          onClick={() => onNavigate('pedidos-publicos')}
          className="flex items-center gap-xs px-md py-sm bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
          Volver a Administración ERP
        </button>
      </header>

      <main className="relative pt-16 bg-surface min-h-screen">
        {/* Hero Section */}
        <div className="relative w-full h-[320px] flex items-center justify-center bg-primary overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-gradient-to-br from-tertiary-fixed via-primary-fixed to-secondary-fixed mix-blend-overlay"></div>
          <div className="relative z-10 text-center px-md max-w-3xl mx-auto pt-8">
            <span className="font-label-md text-label-md text-tertiary-fixed tracking-widest uppercase mb-sm block">Portal de Clientes Online</span>
            <h1 className="font-display-lg text-display-lg text-on-primary mb-md">Hacé tu pedido online</h1>
            <p className="font-body-lg text-body-lg text-inverse-primary max-w-xl mx-auto">
              Navegá nuestro catálogo, seleccioná tus productos favoritos y recibilos directo en tu puerta. Rápido, fácil y seguro.
            </p>
          </div>
        </div>

        {/* Content Layout */}
        <div className="max-w-7xl mx-auto px-lg -mt-12 relative z-20 w-full flex flex-col lg:flex-row gap-lg items-start pb-xl">
          {/* Product Catalog */}
          <div className="flex-1 w-full flex flex-col gap-lg">
            {/* Category Filter Pills */}
            <div className="bg-surface-container-lowest p-md rounded-xl shadow-md flex items-center gap-sm overflow-x-auto border border-outline-variant/20 no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`font-label-md text-label-md px-md py-sm rounded-full whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface text-on-surface hover:bg-surface-container-highest'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Catalog Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-md">
              {filteredProducts.map((prod) => (
                <div key={prod.id} className="bg-surface-container-lowest rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col border border-outline-variant/20 group">
                  <div className="h-44 w-full bg-surface-container-low relative overflow-hidden flex items-center justify-center">
                    {prod.imageUrl ? (
                      <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <span className="material-symbols-outlined text-[48px] text-outline opacity-40">inventory_2</span>
                    )}
                    {prod.stock <= prod.minStock && prod.stock > 0 && (
                      <div className="absolute top-sm right-sm bg-error-container text-on-error-container font-label-md text-label-md px-xs py-base rounded shadow-sm">
                        Últimas Unidades
                      </div>
                    )}
                  </div>
                  <div className="p-md flex flex-col flex-1 gap-sm">
                    <div className="flex justify-between items-start gap-sm">
                      <h3 className="font-headline-md text-headline-md text-on-surface line-clamp-2">{prod.name}</h3>
                      <span className="font-headline-md text-headline-md text-primary">${prod.price.toFixed(2)}</span>
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant line-clamp-2 flex-1">{prod.description || 'Producto de excelente calidad garantizada.'}</p>
                    <button
                      onClick={() => addToCart(prod)}
                      className="w-full bg-secondary-container text-on-secondary-container font-label-md text-label-md py-sm rounded-lg flex items-center justify-center gap-sm hover:opacity-90 transition-opacity shadow-sm cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
                      Agregar al carrito
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Floating Cart & Checkout Panel */}
          <div className="w-full lg:w-96 flex-shrink-0 flex flex-col gap-lg sticky top-20">
            <div className="bg-surface-container-lowest rounded-xl shadow-md overflow-hidden flex flex-col border border-outline-variant/20">
              <div className="bg-primary text-on-primary p-md flex items-center justify-between">
                <h2 className="font-headline-md text-headline-md flex items-center gap-sm">
                  <span className="material-symbols-outlined">shopping_cart</span>
                  Tu Pedido
                </h2>
                <span className="bg-on-primary text-primary font-label-md text-label-md px-sm py-base rounded-full">
                  {cart.length} items
                </span>
              </div>

              {orderConfirmed ? (
                <div className="p-lg text-center flex flex-col items-center justify-center py-10 gap-sm">
                  <span className="material-symbols-outlined text-[48px] text-on-tertiary-container">check_circle</span>
                  <h3 className="font-headline-md text-on-surface">¡Pedido Recibido!</h3>
                  <p className="font-body-md text-on-surface-variant text-xs">Su orden ha sido registrada en el sistema ERP.</p>
                </div>
              ) : (
                <form onSubmit={handleConfirmOrder} className="p-md flex flex-col gap-md">
                  {/* Cart Item list */}
                  <div className="flex flex-col gap-sm max-h-48 overflow-y-auto">
                    {cart.length === 0 ? (
                      <p className="text-center py-4 font-body-md text-on-surface-variant text-xs">El carrito está vacío</p>
                    ) : (
                      cart.map((item) => (
                        <div key={item.product.id} className="flex gap-sm items-center p-sm rounded-lg hover:bg-surface-container-low transition-colors">
                          <div className="w-10 h-10 bg-surface-container-high rounded shrink-0 overflow-hidden flex items-center justify-center">
                            {item.product.imageUrl ? (
                              <img src={item.product.imageUrl} alt={item.product.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="material-symbols-outlined text-outline text-[18px]">inventory_2</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-body-md text-body-md text-on-surface truncate font-semibold">{item.product.name}</p>
                            <p className="font-body-md text-body-md text-on-surface-variant text-[12px]">{item.quantity} x ${item.product.price.toFixed(2)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.product.id)}
                            className="text-error opacity-70 hover:opacity-100 p-xs cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="w-full h-[1px] bg-outline-variant/30"></div>

                  {/* Totals */}
                  <div className="flex flex-col gap-xs font-body-md text-body-md text-on-surface-variant">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Impuestos (21%)</span>
                      <span>${tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-headline-lg text-headline-lg text-on-surface mt-sm pt-sm border-t border-outline-variant/30">
                      <span>Total</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Contact Form */}
                  <div className="flex flex-col gap-sm pt-sm border-t border-outline-variant/20">
                    <h4 className="font-label-md text-on-surface uppercase">Datos de Contacto</h4>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nombre Completo"
                      className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-sm font-body-md text-body-md text-on-surface outline-none"
                      required
                    />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Teléfono / WhatsApp"
                      className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-sm font-body-md text-body-md text-on-surface outline-none"
                      required
                    />

                    <label className="font-label-md text-on-surface uppercase mt-xs">Método de Entrega</label>
                    <label className="flex items-center gap-sm p-sm rounded-lg border border-outline-variant/50 cursor-pointer hover:bg-surface-container-low">
                      <input
                        type="radio"
                        name="del"
                        checked={deliveryMethod === 'delivery'}
                        onChange={() => setDeliveryMethod('delivery')}
                        className="accent-secondary"
                      />
                      <span className="font-body-md text-xs">Envío a Domicilio</span>
                    </label>
                    <label className="flex items-center gap-sm p-sm rounded-lg border border-outline-variant/50 cursor-pointer hover:bg-surface-container-low">
                      <input
                        type="radio"
                        name="del"
                        checked={deliveryMethod === 'pickup'}
                        onChange={() => setDeliveryMethod('pickup')}
                        className="accent-secondary"
                      />
                      <span className="font-body-md text-xs">Retiro en Sucursal Central</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-primary text-on-primary font-label-md text-label-md py-md rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-sm cursor-pointer mt-xs"
                  >
                    Confirmar Pedido
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
