import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { formatMoney } from '../lib/format';
import { afipQrPayload, afipTipoCmp, afipTipoDocRec } from '../lib/qrPayload';

/** Shape returned by GET /api/documents/:id (withHeaderSnapshot) for a FACTURA. */
export interface FacturaPrintDetail {
  id: number;
  type: string;
  series: string;
  number: number;
  date: string;
  currency: string;
  exchangeRate: number | string;
  subtotal: number | string;
  totalTax: number | string;
  total: number | string;
  notes?: string | null;
  companyName?: string | null;
  companyTaxId?: string | null;
  companyAddress?: string | null;
  companyProvince?: string | null;
  companyPostalCode?: string | null;
  companyTaxCondition?: string | null;
  clientName?: string | null;
  clientTaxId?: string | null;
  clientAddress?: string | null;
  clientProvince?: string | null;
  clientPostalCode?: string | null;
  clientTaxCondition?: string | null;
  supplierName?: string | null;
  supplierTaxId?: string | null;
  supplierAddress?: string | null;
  supplierProvince?: string | null;
  supplierPostalCode?: string | null;
  supplierTaxCondition?: string | null;
  items: {
    sku?: string | null;
    taxName?: string | null;
    description: string;
    quantity: number;
    unitPrice: number | string;
    taxRate: number | string;
    discount: number | string;
    lineTotal: number | string;
  }[];
  invoiceData?: {
    invoiceType?: string | null;
    cae?: string | null;
    caeDueDate?: string | null;
    puntoVenta?: number | null;
    supplierCuit?: string | null;
    supplierName?: string | null;
  } | null;
}

interface FacturaPrintModalProps {
  doc: FacturaPrintDetail;
  onClose: () => void;
}

const num = (value: number | string | null | undefined): number => Number(value ?? 0);

function buildQrData(doc: FacturaPrintDetail): string | null {
  const isPurchase = Boolean(doc.supplierName ?? doc.supplierTaxId);
  const emitterDigits = (isPurchase
    ? (doc.invoiceData?.supplierCuit ?? doc.supplierTaxId)
    : doc.companyTaxId)?.replace(/\D/g, '') ?? '';
  const receiverDigits = (isPurchase ? doc.companyTaxId : doc.clientTaxId)?.replace(/\D/g, '') ?? '';
  const cae = doc.invoiceData?.cae ?? '';
  if (!cae || emitterDigits.length < 8 || receiverDigits.length < 8) return null;
  const invoiceType = doc.invoiceData?.invoiceType ?? 'A';
  const total = num(doc.total);
  return afipQrPayload({
    fecha: new Date(doc.date).toISOString(),
    cuit: emitterDigits,
    ptoVta: doc.invoiceData?.puntoVenta ?? 1,
    tipoCmp: afipTipoCmp(invoiceType),
    nroCmp: doc.number,
    importe: total,
    moneda: doc.currency || 'ARS',
    ctz: num(doc.exchangeRate) || 1,
    tipoDocRec: afipTipoDocRec(receiverDigits),
    nroDocRec: receiverDigits,
    cae,
    imptoTotal: total,
    imptoIVA: num(doc.totalTax),
  });
}

export const FacturaPrintModal: React.FC<FacturaPrintModalProps> = ({ doc, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrPayload = useMemo(() => buildQrData(doc), [doc]);

  useEffect(() => {
    if (!qrPayload) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(qrPayload, { width: 150, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [qrPayload]);

  const isPurchase = Boolean(doc.supplierName ?? doc.supplierTaxId);
  const invoiceType = doc.invoiceData?.invoiceType ?? 'A';
  const folio = `${doc.series}-${String(doc.number).padStart(8, '0')}`;
  const punto = String(doc.invoiceData?.puntoVenta ?? '').padStart(4, '0');
  const caeDueDate = doc.invoiceData?.caeDueDate ? doc.invoiceData.caeDueDate.slice(0, 10) : '';
  const emisor = isPurchase
    ? { name: doc.invoiceData?.supplierName ?? doc.supplierName, taxId: doc.invoiceData?.supplierCuit ?? doc.supplierTaxId, address: doc.supplierAddress, province: doc.supplierProvince, postalCode: doc.supplierPostalCode, condition: doc.supplierTaxCondition }
    : { name: doc.companyName, taxId: doc.companyTaxId, address: doc.companyAddress, province: doc.companyProvince, postalCode: doc.companyPostalCode, condition: doc.companyTaxCondition };
  const receptor = isPurchase
    ? { name: doc.companyName, taxId: doc.companyTaxId, address: doc.companyAddress, province: doc.companyProvince, postalCode: doc.companyPostalCode, condition: doc.companyTaxCondition }
    : { name: doc.clientName, taxId: doc.clientTaxId, address: doc.clientAddress, province: doc.clientProvince, postalCode: doc.clientPostalCode, condition: doc.clientTaxCondition };
  const currency = doc.currency || 'ARS';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 p-md" role="dialog" aria-modal="true" aria-label={`Factura ${folio}`}>
      <div className="bg-surface-container-lowest rounded-2xl shadow-xl max-h-[92vh] overflow-auto w-full max-w-3xl flex flex-col">
        <div className="flex items-center justify-between p-md border-b border-outline-variant/30 print:hidden">
          <h2 className="font-headline-md text-headline-md text-on-surface">Imprimir factura</h2>
          <div className="flex items-center gap-sm">
            <button
              onClick={() => window.print()}
              disabled={!qrDataUrl && qrPayload !== null}
              className="px-md py-sm rounded-lg bg-primary text-on-primary font-label-md text-label-md flex items-center gap-sm cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              Imprimir
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="text-outline hover:text-primary cursor-pointer tap-target"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
        </div>

        <div className="print-fiscal relative overflow-hidden p-lg">
          {/* Watermark: this ticket has no fiscal validity. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden="true">
            <span className="text-[72px] font-black text-error/10 rotate-[-18deg] whitespace-nowrap">SIMULACIÓN</span>
          </div>

          <div className="relative flex items-start justify-between gap-md border-b border-outline-variant/40 pb-md mb-md">
            <div>
              <p className="font-headline-lg text-headline-lg text-on-surface leading-tight">{doc.companyName ?? '—'}</p>
              {doc.companyTaxId && <p className="font-body-md text-body-md text-on-surface-variant">CUIT {doc.companyTaxId}</p>}
              <p className="font-body-md text-body-md text-on-surface-variant">
                {[doc.companyAddress, [doc.companyProvince, doc.companyPostalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
              </p>
              {doc.companyTaxCondition && <p className="font-body-md text-body-md text-on-surface-variant">{doc.companyTaxCondition}</p>}
            </div>
            <div className="text-right">
              <p className="font-headline-md text-headline-md text-primary uppercase">Factura {invoiceType}</p>
              <p className="font-mono-sm text-mono-sm text-on-surface">{folio}</p>
              <p className="font-body-md text-body-md text-on-surface-variant">Fecha: {doc.date.slice(0, 10)}</p>
              {punto && <p className="font-mono-sm text-mono-sm text-on-surface-variant">Punto de venta: {punto}</p>}
              <p className="font-mono-sm text-mono-sm text-on-surface-variant">CAE: {doc.invoiceData?.cae ?? '—'}</p>
              {caeDueDate && <p className="font-body-md text-body-md text-on-surface-variant">Vto. CAE: {caeDueDate}</p>}
            </div>
          </div>

          <div className="relative grid grid-cols-2 gap-md mb-md">
            <div>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-xs">{isPurchase ? 'Emisor (proveedor)' : 'Emisor'}</p>
              <p className="font-body-md text-body-md text-on-surface">{emisor.name ?? '—'}</p>
              {emisor.taxId && <p className="font-body-md text-body-md text-on-surface-variant">CUIT {emisor.taxId}</p>}
              <p className="font-body-md text-body-md text-on-surface-variant">
                {[emisor.address, [emisor.province, emisor.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
              </p>
              {emisor.condition && <p className="font-body-md text-body-md text-on-surface-variant">{emisor.condition}</p>}
            </div>
            <div>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-xs">Receptor</p>
              <p className="font-body-md text-body-md text-on-surface">{receptor.name ?? '—'}</p>
              {receptor.taxId && <p className="font-body-md text-body-md text-on-surface-variant">CUIT {receptor.taxId}</p>}
              <p className="font-body-md text-body-md text-on-surface-variant">
                {[receptor.address, [receptor.province, receptor.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
              </p>
              {receptor.condition && <p className="font-body-md text-body-md text-on-surface-variant">{receptor.condition}</p>}
            </div>
          </div>

          <table className="relative w-full text-left border-collapse mb-md">
            <thead>
              <tr className="border-b border-outline-variant/40 font-label-md text-label-md text-on-surface-variant text-[11px] uppercase tracking-wider">
                <th className="py-xs pr-sm">Código</th>
                <th className="py-xs pr-sm">Descripción</th>
                <th className="py-xs pr-sm text-right">Cant.</th>
                <th className="py-xs pr-sm text-right">Precio</th>
                <th className="py-xs pr-sm text-right">IVA %</th>
                <th className="py-xs text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((item, index) => (
                <tr key={index} className="border-b border-outline-variant/20">
                  <td className="py-xs pr-sm font-mono-sm text-mono-sm text-on-surface-variant">{item.sku ?? ''}</td>
                  <td className="py-xs pr-sm font-body-md text-body-md text-on-surface">{item.description}</td>
                  <td className="py-xs pr-sm text-right font-mono-sm text-mono-sm">{item.quantity}</td>
                  <td className="py-xs pr-sm text-right font-mono-sm text-mono-sm">{formatMoney(num(item.unitPrice), currency)}</td>
                  <td className="py-xs pr-sm text-right font-mono-sm text-mono-sm">{num(item.taxRate)}%</td>
                  <td className="py-xs text-right font-mono-sm text-mono-sm">{formatMoney(num(item.lineTotal), currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="relative flex items-end justify-between gap-md">
            <div className="flex flex-col gap-xs">
              {qrDataUrl ? (
                <>
                  <img src={qrDataUrl} alt="QR AFIP simulado" className="w-24 h-24" />
                  <p className="font-body-md text-body-md text-on-surface-variant text-[10px]">QR interno (simulación — sin validez fiscal)</p>
                </>
              ) : (
                <p className="font-body-md text-body-md text-on-surface-variant text-xs">Código QR no disponible: faltan CUIT/CAE del comprobante.</p>
              )}
              {doc.notes && <p className="font-body-md text-body-md text-on-surface-variant text-xs">Notas: {doc.notes}</p>}
            </div>
            <div className="text-right flex flex-col gap-1">
              <p className="font-body-md text-body-md text-on-surface-variant flex justify-between gap-xl">
                <span>Subtotal</span><span className="font-mono-sm text-mono-sm">{formatMoney(num(doc.subtotal), currency)}</span>
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant flex justify-between gap-xl">
                <span>IVA</span><span className="font-mono-sm text-mono-sm">{formatMoney(num(doc.totalTax), currency)}</span>
              </p>
              <p className="font-headline-md text-headline-md text-on-surface flex justify-between gap-xl border-t border-outline-variant/40 pt-xs">
                <span>TOTAL</span><span className="font-mono-sm">{formatMoney(num(doc.total), currency)}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};