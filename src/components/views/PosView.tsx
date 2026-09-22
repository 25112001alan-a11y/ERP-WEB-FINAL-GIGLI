import React, { useEffect, useRef, useState } from 'react';
import { ViewPath, Product, CartItem, SaleTransaction, BranchOption } from '../../types';
import { branchStock } from '../../lib/branch';
import { ApiError, apiFetch } from '../../lib/api';

export interface CompleteSalePayload {
  items: CartItem[];
  method: string;
  clientName: string;
  payments?: { method: string; amount: number }[];
  // Cobro online: crea la VENTA pendiente (sin pagos) para cobrarla por MP.
  pending?: boolean;
}

// Fixed payment method set accepted by POST /api/documents (payments array).
const PAYMENT_METHODS = ['Efectivo', 'Tarjeta', 'QR / Transf.'];

interface PosViewProps {
  products: Product[];
  branches?: BranchOption[];
  activeBranchId?: number | null;
  branchWarehouseIds?: Set<number> | null;
  activeBranchName?: string;
  onClearBranch?: () => void;
  onSelectBranch?: (branchId: number) => void;
  branchLocked?: boolean;
  onCompleteSale: (payload: CompleteSalePayload) => Promise<SaleTransaction>;
  onNavigate: (view: ViewPath) => void;
}

export const PosView: React.FC<PosViewProps> = ({
  products,
  branches = [],
  activeBranchId = null,
  branchWarehouseIds = null,
  activeBranchName,
  onClearBranch,
  onSelectBranch,
  branchLocked = false,
  onCompleteSale,
  onNavigate,
}) => {
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
  // Cobro online Mercado Pago: link a pagar + polling hasta aprobado/rechazado.
  const [mpModal, setMpModal] = useState<{ open: boolean; initPoint: string; code: string; paymentId: number | null; status: string }>(
    { open: false, initPoint: '', code: '', paymentId: null, status: 'pending' },
  );
  // Aviso no bloqueante (p. ej. "MP no configurado" cuando se registra manual).
  const [mpNote, setMpNote] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopMpPoll = () => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  const closeMpModal = () => {
    stopMpPoll();
    setMpModal({ open: false, initPoint: '', code: '', paymentId: null, status: 'pending' });
  };

  // Scanner modal: camera (native BarcodeDetector) + HID pistol (keyboard input).
  const [scanOpen, setScanOpen] = useState(false);
  const [scanValue, setScanValue] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (scanTimerRef.current != null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  // Never leave a zombie camera: stop tracks when the modal closes or unmounts.
  const closeScanModal = () => {
    stopCamera();
    setScanOpen(false);
    setScanValue('');
    setScanError(null);
    setScanNotice(null);
    setCameraError(null);
  };

  useEffect(() => {
    return () => {
      if (scanTimerRef.current != null) window.clearTimeout(scanTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, []);

  // Bloquear el scroll de fondo mientras el carrito mobile está abierto.
  useEffect(() => {
    document.body.style.overflow = cartOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [cartOpen]);

  const categories = ['Todos', 'Electrónica', 'Ropa', 'Muebles', 'Bebidas', 'Snacks'];

  // Branch-scoped availability (null = "Todas", current behavior).
  const avail = (prod: Product) => branchStock(prod, branchWarehouseIds ?? null);

  const filteredProducts = products.filter((prod) => {
    const matchesSearch = prod.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prod.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'Todos' || prod.category === selectedCategory;
    const matchesBranch = branchWarehouseIds == null || avail(prod) > 0 || prod.allowOversell;
    return matchesSearch && matchesCat && matchesBranch;
  });

  // POS happens at ONE physical point of sale: without a branch selected
  // (owner on "Todas") the grid and checkout stay disabled behind a prompt.
  const needsBranch = activeBranchId == null;

  const addToCart = (product: Product) => {
    if (needsBranch) return;
    if (avail(product) <= 0 && !product.allowOversell) return;
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

  // Scanner lookup over the products already in memory:
  // barcode exacto → sku/código interno exacto → nombre contiene.
  const findProductByCode = (code: string): Product | null => {
    const q = code.trim().toLowerCase();
    if (!q) return null;
    return (
      products.find((p) => (p.barcode ?? '').toLowerCase() === q) ??
      products.find((p) => p.sku.toLowerCase() === q) ??
      products.find((p) => p.name.toLowerCase().includes(q)) ??
      null
    );
  };

  const submitScan = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const found = findProductByCode(code);
    if (!found) {
      setScanError(`Código no encontrado: ${code}`);
      return;
    }
    setScanError(null);
    addToCart(found);
    setScanValue('');
    setScanNotice(`Agregado: ${found.name}`);
  };

  const startCamera = async () => {
    setCameraError(null);
    const w = window as unknown as {
      BarcodeDetector?: {
        new (opts: { formats: string[] }): {
          detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]>;
        };
        getSupportedFormats?: () => Promise<string[]>;
      };
    };
    if (!w.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Tu navegador no soporta cámara. Usá el campo de la pistola abajo.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      // Foco continuo: los 1D (barras finas) no decodifican con el foco
      // fijo de baja resolución que negocian algunos móviles.
      try {
        await stream.getVideoTracks()[0]?.applyConstraints({
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        });
      } catch {
        // focusMode no soportado — se sigue con el foco por defecto
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // play() can reject on transient interruptions; the tick still decodes.
        }
      }
      setCameraOn(true);
      // QR + 1D de productos reales (EAN-13/8, UPC, Code128/39, ITF...),
      // filtrados por lo que el navegador soporta (Safari trae menos).
      const CANDIDATE_FORMATS = [
        'qr_code',
        'ean_13', 'ean_8',
        'upc_a', 'upc_e',
        'code_128', 'code_39',
        'itf', 'codabar',
        'data_matrix', 'aztec',
      ];
      let formats = CANDIDATE_FORMATS;
      try {
        if (typeof w.BarcodeDetector?.getSupportedFormats === 'function') {
          const supported = await w.BarcodeDetector.getSupportedFormats();
          const filtered = CANDIDATE_FORMATS.filter((f) => supported.includes(f));
          if (filtered.length > 0) formats = filtered;
        }
      } catch {
        // keep candidates; the constructor below throws if truly unsupported
      }
      const detector = new w.BarcodeDetector({ formats });
      const tick = async () => {
        try {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            const codes = await detector.detect(videoRef.current);
            const value = codes?.[0]?.rawValue;
            if (value) {
              // One read per activation: stop the camera, report inline.
              stopCamera();
              submitScan(value);
              return;
            }
          }
        } catch {
          // Transient decode errors: keep scanning.
        }
        if (streamRef.current) scanTimerRef.current = window.setTimeout(tick, 400);
      };
      tick();
    } catch {
      setCameraError('No se pudo acceder a la cámara. Revisá los permisos o usá la pistola abajo.');
    }
  };

  const handleCheckout = async (method: string) => {
    if (cart.length === 0 || checkingOut || needsBranch) return;

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

    // Tarjeta / QR-Transf.: venta real con estado Pagado y método registrado.
    // El cobro online de Mercado Pago es Fase E (fuera de alcance): el QR de
    // acá registra el pago presencial por QR/transferencia como Pagado.
    setCheckingOut(true);
    setSaleError(null);
    try {
      await onCompleteSale({ items: cart, method, clientName, payments: [{ method, amount: total }] });
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
      // Venta real en efectivo: una fila de pago por el total (el vuelto es
      // solo informativo del cliente, no se persiste).
      await onCompleteSale({ items: cart, method: 'Efectivo', clientName, payments: [{ method: 'Efectivo', amount: total }] });
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
      // Venta real con N filas de pago (el servidor valida suma == total).
      const payments = splitModal.rows.map((r) => ({ method: r.method, amount: parseFloat(r.amount) }));
      await onCompleteSale({
        items: cart,
        method: payments.map((p) => p.method).join(' + '),
        clientName,
        payments,
      });
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
            disabled={needsBranch}
            className="bg-primary text-on-primary rounded-xl p-md flex flex-col items-center justify-center gap-xs shadow-md hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
            <span className="font-label-md text-label-md">Efectivo</span>
          </button>
          <button
            onClick={() => handleCheckout('Tarjeta')}
            disabled={needsBranch}
            className="bg-surface-container-lowest text-on-surface rounded-xl p-md flex flex-col items-center justify-center gap-xs shadow-sm hover:shadow-md transition-all border border-surface-container-high hover:-translate-y-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[28px]">credit_card</span>
            <span className="font-label-md text-label-md">Tarjeta</span>
          </button>
          <button
            onClick={() => handleCheckout('QR / Transf.')}
            disabled={needsBranch}
            className="bg-surface-container-lowest text-on-surface rounded-xl p-md flex flex-col items-center justify-center gap-xs shadow-sm hover:shadow-md transition-all border border-surface-container-high hover:-translate-y-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[28px]">qr_code_scanner</span>
            <span className="font-label-md text-label-md">QR / Transf.</span>
          </button>
          <button
            onClick={() => handleCheckout('Dividir Pago')}
            disabled={needsBranch}
            className="bg-surface-container-lowest text-on-surface rounded-xl p-md flex flex-col items-center justify-center gap-xs shadow-sm hover:shadow-md transition-all border border-surface-container-high hover:-translate-y-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
            disabled={checkingOut || needsBranch}
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
              <button
                onClick={() => { setScanOpen(true); setScanError(null); setScanNotice(null); }}
                aria-label="Escanear código QR o de barras"
                className="w-12 h-12 bg-surface-container-high text-on-surface flex items-center justify-center rounded-xl hover:bg-surface-variant transition-colors shadow-sm shrink-0 tap-target"
              >
                <span className="material-symbols-outlined">barcode_scanner</span>
              </button>
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-sm overflow-x-auto pb-sm no-scrollbar">
              {branchWarehouseIds != null && (
                branchLocked ? (
                  <span className="inline-flex items-center gap-xs px-md py-sm rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md whitespace-nowrap shrink-0">
                    <span className="material-symbols-outlined text-[16px]">store</span>
                    {activeBranchName ?? 'Sucursal'}
                  </span>
                ) : (
                <button
                  onClick={onClearBranch}
                  title="Mostrar todas las sucursales"
                  className="inline-flex items-center gap-xs px-md py-sm rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">store</span>
                  {activeBranchName ?? 'Sucursal'}
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
                )
              )}
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

          {/* Product Grid — blocked until a branch is chosen */}
          <div className="flex-1 overflow-y-auto p-lg bg-surface-container-lowest min-h-[400px]">
            {needsBranch ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-md py-10">
                <span className="material-symbols-outlined text-[48px] text-outline opacity-60">store</span>
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  Seleccioná la sucursal del punto de venta para operar
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-[420px]">
                  Cada venta ocurre en una sucursal física. Elegí una para ver su stock y cobrar.
                </p>
                <div className="flex flex-wrap justify-center gap-sm mt-sm">
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => onSelectBranch?.(b.id)}
                      className="px-md py-sm rounded-xl bg-primary text-on-primary font-label-md text-label-md shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-sm">
              {filteredProducts.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  className={`group flex flex-col bg-surface rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer transform hover:-translate-y-1 border border-outline-variant/20 ${
                    avail(prod) <= 0 && !prod.allowOversell ? 'opacity-50 cursor-not-allowed grayscale' : ''
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
                        avail(prod) <= 0 && !prod.allowOversell
                          ? 'bg-error text-on-error'
                          : 'bg-surface/80 backdrop-blur text-on-surface'
                      }`}
                    >
                      {avail(prod)} un.
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
            )}
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

      {/* Scanner Modal: cámara nativa + pistola HID, mismo resultado */}
      {scanOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex p-md overflow-y-auto" onClick={closeScanModal}>
          <div className="bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-[24rem] p-lg border border-outline-variant/30 m-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Escanear código</h3>
            <div className="relative w-full mb-md">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full rounded-xl bg-black ${cameraOn ? '' : 'hidden'}`}
              />
              {cameraOn && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className="w-3/4 h-24 border-2 border-dashed border-white/80 rounded-lg" />
                  <p className="text-white/90 text-xs bg-black/50 rounded px-2 py-1">Apuntá el código dentro del marco</p>
                </div>
              )}
            </div>
            {!cameraOn && (
              <button
                onClick={startCamera}
                className="w-full mb-md px-md py-sm rounded-xl bg-secondary text-on-secondary font-label-md text-label-md hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-sm"
              >
                <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                Apuntá al código con la cámara
              </button>
            )}
            {cameraError && (
              <div className="bg-error-container text-on-error-container rounded-xl px-md py-sm font-body-md text-body-md mb-md">
                {cameraError}
              </div>
            )}
            <div className="flex flex-col gap-sm mb-md">
              <label className="font-label-md text-label-md text-on-surface-variant">o dispará con la pistola acá</label>
              <input
                type="text"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitScan(scanValue); }}
                placeholder="El lector escribe acá y termina con Enter"
                className="w-full bg-surface border border-outline-variant/50 rounded-lg px-md py-sm font-body-lg text-body-lg focus:ring-2 focus:ring-primary outline-none"
                autoFocus
              />
            </div>
            {scanError && (
              <div className="bg-error-container text-on-error-container rounded-xl px-md py-sm font-body-md text-body-md mb-md">
                {scanError}
              </div>
            )}
            {scanNotice && !scanError && (
              <div className="bg-tertiary-container text-on-tertiary-container rounded-xl px-md py-sm font-body-md text-body-md mb-md">
                {scanNotice}
              </div>
            )}
            <div className="flex gap-sm justify-end">
              <button onClick={closeScanModal} className="px-md py-sm rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Received Modal */}
      {cashModal.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex p-md overflow-y-auto" onClick={() => setCashModal({ open: false, received: '' })}>
          <div className="bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-[24rem] p-lg border border-outline-variant/30 m-auto" onClick={(e) => e.stopPropagation()}>
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
        <div className="fixed inset-0 z-50 bg-black/40 flex p-md overflow-y-auto" onClick={() => setSplitModal({ open: false, rows: [] })}>
          <div className="bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-[28rem] p-lg border border-outline-variant/30 m-auto" onClick={(e) => e.stopPropagation()}>
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
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
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