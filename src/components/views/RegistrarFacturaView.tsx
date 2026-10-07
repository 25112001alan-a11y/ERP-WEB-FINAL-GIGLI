import React, { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../../lib/format';
import { ViewPath, Supplier, Product } from '../../types';
import type { ApiDocument } from '../../lib/mappers';
import { resolveClientSelection, type ClientOption } from '../../lib/clientSelection';
import {
  derivedCounterparty,
  derivedDocumentLines,
  invoiceSourceDocuments,
  resolveSourceSelection,
} from '../../lib/documentDerivation';

const STALE_SOURCE_ERROR = 'El documento origen ya no está disponible. Seleccione un origen válido nuevamente.';

interface RegistrarFacturaViewProps {
  suppliers: Supplier[];
  clients: ClientOption[];
  salesDocs: ApiDocument[];
  remitoDocs: ApiDocument[];
  products: Product[];
  /** Fixed by the entry point: Compras opens 'ingreso', Ventas opens 'egreso'. */
  direction: 'ingreso' | 'egreso';
  /** Document chosen in Ventas: preloaded as origin when it is still eligible. */
  initialSourceId?: string | null;
  onCreateFactura: (payload: {
    direction: 'ingreso' | 'egreso';
    sourceDocumentId?: number;
    supplierId?: number;
    clientId?: number;
    clientName?: string;
    items: { productId: number; sourceDocumentItemId?: number; quantity: number; unitPrice?: number }[];
    invoice: { invoiceType: string; cae?: string; caeDueDate?: string; puntoVenta?: number };
    externalNumber?: string;
    paymentMethod?: string;
    notes?: string;
  }) => Promise<void>;
  onNavigate: (view: ViewPath) => void;
}

interface DraftLine {
  key: string;
  sourceDocumentItemId?: number;
  originalQuantity?: number;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  maxQuantity?: number;
}

export const RegistrarFacturaView: React.FC<RegistrarFacturaViewProps> = ({
  suppliers,
  clients,
  salesDocs,
  remitoDocs,
  products,
  direction,
  initialSourceId,
  onCreateFactura,
  onNavigate,
}) => {
  // Computed before the state below: the initial selection needs the list.
  const sourceDocs = useMemo(
    () => invoiceSourceDocuments(direction, salesDocs, remitoDocs),
    [direction, salesDocs, remitoDocs],
  );
  // The origin starts preselected so the derived path is the default: the
  // document picked in Ventas when it is eligible, otherwise the newest
  // eligible one. "Sin origen" stays in the list, it just stops being the
  // default.
  const [sourceId, setSourceId] = useState(() => {
    if (initialSourceId) {
      return sourceDocs.some((d) => String(d.id) === initialSourceId) ? initialSourceId : '';
    }
    return sourceDocs[0] ? String(sourceDocs[0].id) : '';
  });
  const [supplierId, setSupplierId] = useState('');
  const [clientName, setClientName] = useState('');
  const [externalNumber, setExternalNumber] = useState('');
  const [invoiceType, setInvoiceType] = useState('A');
  const [puntoVenta, setPuntoVenta] = useState('');
  const [cae, setCae] = useState('');
  const [caeDueDate, setCaeDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [draftProductId, setDraftProductId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const sourceSelection = resolveSourceSelection(sourceId, sourceDocs);
  const selectedSource = sourceSelection.source;

  // Selecting a source replaces every derived value; stale manual state never
  // survives a source change.
  useEffect(() => {
    if (sourceSelection.state !== 'valid' || !selectedSource) {
      setLines([]);
      setSupplierId('');
      setClientName('');
      setError((current) => sourceSelection.state === 'stale'
        ? STALE_SOURCE_ERROR
        : current === STALE_SOURCE_ERROR ? '' : current);
      return;
    }
    setLines(derivedDocumentLines(selectedSource).map((line) => ({ ...line, sku: '' })));
    const party = derivedCounterparty(selectedSource, direction);
    setSupplierId(party.supplierId);
    setClientName(party.clientName);
    setError((current) => current === STALE_SOURCE_ERROR ? '' : current);
  }, [direction, selectedSource, sourceSelection.state]);

  const addManualLine = () => {
    if (selectedSource) return;
    const product = products.find((p) => p.id === draftProductId);
    if (!product) return;
    setLines((prev) => [...prev, {
      key: `manual-${product.id}-${prev.length}`,
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity: 1,
      unitPrice: product.price,
    }]);
    setDraftProductId('');
  };

  const lineTotal = (l: DraftLine) => l.quantity * l.unitPrice;
  const subtotal = lines.reduce((acc, l) => acc + lineTotal(l), 0);

  const handleSubmit = async () => {
    setError('');
    if (sourceId && sourceSelection.state !== 'valid') {
      setError(STALE_SOURCE_ERROR);
      return;
    }
    const payloadLines = lines
      .filter((l) => l.quantity > 0)
      .map((l) => ({
        productId: Number(l.productId),
        ...(selectedSource && l.sourceDocumentItemId !== undefined
          ? { sourceDocumentItemId: l.sourceDocumentItemId }
          : {}),
        quantity: l.quantity,
        ...(selectedSource ? {} : { unitPrice: l.unitPrice }),
      }));
    if (payloadLines.length === 0) {
      setError('Agregue al menos un ítem con cantidad mayor a cero.');
      return;
    }
    if (!invoiceType) {
      setError('Seleccione el tipo de factura (A/B/C/X).');
      return;
    }
    const payload: Parameters<RegistrarFacturaViewProps['onCreateFactura']>[0] = {
      direction,
      items: payloadLines,
      invoice: {
        invoiceType,
        cae: cae || undefined,
        caeDueDate: caeDueDate ? new Date(caeDueDate).toISOString() : undefined,
        puntoVenta: puntoVenta ? Number(puntoVenta) : undefined,
      },
      externalNumber: externalNumber || undefined,
      paymentMethod: paymentMethod || undefined,
      notes: notes || undefined,
    };
    if (selectedSource) {
      payload.sourceDocumentId = selectedSource.id;
    } else if (direction === 'ingreso') {
      if (!supplierId) {
        setError('Seleccione el proveedor de la factura.');
        return;
      }
      payload.supplierId = Number(supplierId);
    } else {
      // Free-typed client: linked to the master when the name matches it,
      // plain name otherwise (the server keeps its find-or-create fallback).
      const selection = resolveClientSelection(clientName, clients);
      if (selection.clientName) {
        payload.clientName = selection.clientName;
        if (selection.clientId !== undefined) payload.clientId = selection.clientId;
      } else {
        setError('Seleccione una venta/remito de cliente o ingrese el nombre del cliente.');
        return;
      }
    }
    setSaving(true);
    try {
      await onCreateFactura(payload);
      setSaved(true);
      setTimeout(() => onNavigate(direction === 'ingreso' ? 'compras' : 'ventas'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la factura.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full p-lg gap-lg font-body-md text-on-surface">
      <datalist id="factura-clients">
        {clients.map((client) => (
          <option key={client.id} value={client.name} />
        ))}
      </datalist>
      <header className="flex items-center justify-between pb-sm border-b border-outline-variant/30 flex-wrap gap-sm">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-xs">
            <button
              onClick={() => onNavigate(direction === 'ingreso' ? 'compras' : 'ventas')}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              {direction === 'ingreso' ? 'Compras' : 'Ventas'}
            </button>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="text-on-surface font-semibold">Registrar Factura</span>
          </nav>
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">
            Registrar Factura de {direction === 'ingreso' ? 'Compra' : 'Venta'} (simulada · sin validez fiscal)
          </h1>
        </div>
        <div className="flex gap-sm flex-wrap">
          <button
            onClick={() => onNavigate(direction === 'ingreso' ? 'compras' : 'ventas')}
            className="px-md py-sm rounded-lg border border-outline-variant text-on-surface font-label-md text-label-md uppercase tracking-wider hover:bg-surface-container transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-md py-sm rounded-lg bg-tertiary-container text-on-tertiary-container font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity shadow-md flex items-center gap-sm cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {saving ? 'Procesando...' : 'Registrar Factura'}
          </button>
        </div>
      </header>

      {saved ? (
        <div className="p-xl text-center py-20 bg-surface-container-lowest rounded-xl shadow-md border border-outline-variant/30 flex flex-col items-center gap-md">
          <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">receipt_long</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Factura Registrada</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            La factura quedó vinculada al documento de origen con sus datos fiscales.
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div className="bg-error/10 text-error px-md py-sm rounded-lg border border-error/30 font-body-md flex items-center gap-sm">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {/* Direction is fixed by the entry point (Compras / Ventas) */}

          <div role="note" className="rounded-lg border border-amber-500/40 bg-amber-50 px-md py-sm text-amber-950">
            <strong>Simulación — sin validez fiscal.</strong> Este formulario sólo registra datos cargados manualmente; no se conecta con ARCA ni autoriza comprobantes.
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
            <div className="lg:col-span-2 space-y-lg">
              {/* Fiscal data */}
              <section className="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
                <h2 className="font-headline-md text-headline-md mb-md flex items-center gap-sm text-primary">
                  <span className="material-symbols-outlined">receipt_long</span>
                  Datos Fiscales
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Tipo de Factura</label>
                    <select
                      value={invoiceType}
                      onChange={(e) => setInvoiceType(e.target.value)}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none cursor-pointer"
                    >
                      <option value="A">Factura A</option>
                      <option value="B">Factura B</option>
                      <option value="C">Factura C</option>
                      <option value="X">Factura X (no gravada)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Punto de Venta</label>
                    <input
                      type="number"
                      value={puntoVenta}
                      onChange={(e) => setPuntoVenta(e.target.value)}
                      placeholder="Ej: 4"
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none font-mono-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">CAE</label>
                    <input
                      type="text"
                      maxLength={14}
                      value={cae}
                      onChange={(e) => setCae(e.target.value)}
                      placeholder="Código de autorización (14 dígitos)"
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none font-mono-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Vencimiento CAE</label>
                    <input
                      type="date"
                      value={caeDueDate}
                      onChange={(e) => setCaeDueDate(e.target.value)}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">
                      {direction === 'ingreso' ? 'Nº Factura del Proveedor' : 'Folio / Nº Documento'}
                    </label>
                    <input
                      type="text"
                      maxLength={50}
                      value={externalNumber}
                      onChange={(e) => setExternalNumber(e.target.value)}
                      placeholder="Opcional"
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none font-mono-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant uppercase">Método de Pago</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none cursor-pointer"
                    >
                      <option value="">Pendiente (sin pago)</option>
                      <option value="Efectivo">Efectivo</option>
                      <option value="Transferencia">Transferencia</option>
                      <option value="Tarjeta">Tarjeta</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Origin */}
              <section className="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
                <h2 className="font-headline-md text-headline-md mb-md flex items-center gap-sm text-primary">
                  <span className="material-symbols-outlined">link</span>
                  Documento de Origen
                </h2>
                <div className="flex flex-col gap-md">
                  <select
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none cursor-pointer"
                  >
                    <option value="">
                      {direction === 'ingreso'
                        ? 'Sin origen (cargar líneas manualmente)'
                        : 'Sin origen (cargar líneas manualmente)'}
                    </option>
                    {sourceDocs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.type} {d.series}-{String(d.number).padStart(4, '0')} — {d.supplier?.name ?? d.client?.name} ({formatMoney(Number(d.total))})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-on-surface-variant">
                    El origen define contraparte, productos y precios. Sólo puede reducir las cantidades;
                    el servidor valida el saldo todavía pendiente.
                  </p>
                </div>
              </section>

              {/* Party */}
              <section className="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
                <h2 className="font-headline-md text-headline-md mb-md flex items-center gap-sm text-primary">
                  <span className="material-symbols-outlined">person</span>
                  {direction === 'ingreso' ? 'Proveedor' : 'Cliente'}
                </h2>
                {direction === 'ingreso' ? (
                  <div className="flex flex-col gap-xs">
                    <select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      disabled={Boolean(selectedSource)}
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      <option value="">Seleccione el proveedor...</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-col gap-xs">
                    <input
                      type="text"
                      list="factura-clients"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      disabled={Boolean(selectedSource)}
                      placeholder="Nombre del cliente (si no usó un documento de origen)"
                      className="w-full bg-surface px-md py-sm rounded-lg border border-outline-variant/50 focus:border-primary outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                    />
                  </div>
                )}
              </section>

              {/* Items */}
              <section className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 overflow-hidden">
                <div className="p-lg border-b border-outline-variant/20 bg-surface-container/30 flex items-center justify-between gap-md flex-wrap">
                  <h2 className="font-headline-md text-headline-md flex items-center gap-sm text-primary">
                    <span className="material-symbols-outlined">rule</span>
                    Ítems de la Factura
                  </h2>
                  {!selectedSource && <div className="flex items-center gap-sm flex-wrap">
                    <select
                      value={draftProductId}
                      onChange={(e) => setDraftProductId(e.target.value)}
                      className="bg-surface border border-outline-variant/50 rounded-lg px-md py-xs font-body-md focus:border-primary outline-none cursor-pointer"
                    >
                      <option value="">Seleccionar producto...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={addManualLine}
                      className="bg-surface-container-low border border-outline-variant rounded-lg px-md py-xs font-label-md text-label-md uppercase flex items-center gap-xs hover:bg-surface-container transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span> Agregar
                    </button>
                  </div>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant/20 font-label-md text-label-md text-on-surface-variant uppercase">
                        <th className="py-sm px-md">Producto</th>
                        <th className="py-sm px-md text-right">Cant. / saldo</th>
                        <th className="py-sm px-md text-right">P. Unit.</th>
                        <th className="py-sm px-md text-right">Subtotal</th>
                        <th className="py-sm px-md w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="font-body-md divide-y divide-outline-variant/10">
                      {lines.map((line, idx) => (
                        <tr key={line.key} className="hover:bg-surface-container/20">
                          <td className="py-md px-md font-medium">
                            <span className="truncate max-w-[220px]">{line.sku ? `${line.sku} — ` : ''}{line.name}</span>
                            {selectedSource && line.originalQuantity !== undefined && <span className="block text-xs text-on-surface-variant">Origen: {line.originalQuantity} u. · pendiente: {line.maxQuantity} u.</span>}
                          </td>
                          <td className="py-md px-md text-right">
                            <input
                              type="number"
                              min="0"
                              max={line.maxQuantity}
                              value={line.quantity}
                              onChange={(e) => {
                                const requested = Math.max(0, Number(e.target.value) || 0);
                                const val = line.maxQuantity === undefined
                                  ? requested
                                  : Math.min(line.maxQuantity, requested);
                                setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: val } : l)));
                              }}
                              className="w-24 bg-surface border border-outline-variant rounded px-sm py-xs text-right font-mono-sm focus:border-primary outline-none"
                            />
                          </td>
                          <td className="py-md px-md text-right">
                            <input
                              type="number"
                              min="0"
                              value={line.unitPrice}
                              disabled={Boolean(selectedSource)}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unitPrice: val } : l)));
                              }}
                              className="w-28 bg-surface border border-outline-variant rounded px-sm py-xs text-right font-mono-sm focus:border-primary outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="py-md px-md text-right font-mono-sm">{formatMoney(lineTotal(line))}</td>
                          <td className="py-md px-md text-right">
                            <button
                              onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-error/70 hover:text-error transition-colors cursor-pointer tap-target"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-lg px-md text-center text-on-surface-variant">
                            Sin ítems — seleccione un documento de origen o agregue productos manualmente.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* Right column */}
            <div className="space-y-lg">
              <section className="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/20">
                <h2 className="font-headline-md text-headline-md mb-md flex items-center gap-sm text-primary">
                  <span className="material-symbols-outlined">notes</span>
                  Observaciones
                </h2>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full bg-surface border border-outline-variant/50 rounded-lg p-md focus:border-primary outline-none resize-none font-body-md"
                ></textarea>
              </section>
              <section className="bg-surface-container-low p-lg rounded-xl border border-outline-variant/20 flex flex-col gap-sm">
                <div className="flex items-center gap-sm text-on-surface">
                  <span className="material-symbols-outlined">calculate</span>
                  <span className="font-label-md text-label-md uppercase tracking-wider">Resumen</span>
                </div>
                <div className="flex items-center justify-between font-body-md">
                  <span className="text-on-surface-variant">Subtotal</span>
                  <span className="font-mono-sm">{formatMoney(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between font-body-lg border-t border-outline-variant/20 pt-sm">
                  <span className="font-semibold">Total (sin IVA calculado)</span>
                  <span className="font-mono-sm font-bold">{formatMoney(subtotal)}</span>
                </div>
                <p className="text-xs text-on-surface-variant">
                  El total final incluye el IVA según la categoría fiscal de cada producto.
                </p>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
