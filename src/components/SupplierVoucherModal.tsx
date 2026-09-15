import React, { useRef, useState } from 'react';
import { apiFetch, apiUpload, API_BASE } from '../lib/api';

export interface SupplierVoucherData {
  externalNumber?: string;
  supplierCuit?: string;
  supplierName?: string;
  emissionDate?: string;
  externalSubtotal?: number;
  externalTax?: number;
  externalTotal?: number;
  ingestionMethod?: 'manual' | 'lector' | 'ocr';
  attachmentUrl?: string | null;
  verifiedByName?: string;
}

interface SupplierVoucherModalProps {
  documentId: number;
  documentLabel: string;
  data: SupplierVoucherData;
  onClose: () => void;
  onSaved: (patch: {
    hasExternalVoucher: true;
    externalNumber?: string;
  }) => void;
}

const INGESTION_LABELS: Record<string, string> = {
  manual: 'Manual',
  lector: 'Lector',
  ocr: 'OCR',
};

function toInputDate(isoOrDate?: string): string {
  if (!isoOrDate) return '';
  try {
    const d = new Date(isoOrDate);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export const SupplierVoucherModal: React.FC<SupplierVoucherModalProps> = ({
  documentId,
  documentLabel,
  data,
  onClose,
  onSaved,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [externalNumber, setExternalNumber] = useState(data.externalNumber ?? '');
  const [supplierCuit, setSupplierCuit] = useState(data.supplierCuit ?? '');
  const [supplierName, setSupplierName] = useState(data.supplierName ?? '');
  const [emissionDate, setEmissionDate] = useState(() => toInputDate(data.emissionDate));
  const [externalSubtotal, setExternalSubtotal] = useState(data.externalSubtotal?.toString() ?? '');
  const [externalTax, setExternalTax] = useState(data.externalTax?.toString() ?? '');
  const [externalTotal, setExternalTotal] = useState(data.externalTotal?.toString() ?? '');
  const [ingestionMethod, setIngestionMethod] = useState<'manual' | 'lector' | 'ocr'>(data.ingestionMethod ?? 'manual');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(data.attachmentUrl ?? null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // 1) Upload file if selected
      if (fileRef.current?.files?.[0]) {
        const { attachmentUrl: url } = await apiUpload<{ attachmentUrl: string }>(
          `/api/documents/${documentId}/external/attach`,
          fileRef.current.files[0],
        );
        setAttachmentUrl(url);
      }

      // 2) Persist voucher data
      await apiFetch(`/api/documents/${documentId}/external`, {
        method: 'PATCH',
        body: {
          externalNumber: externalNumber || undefined,
          supplierCuit: supplierCuit || undefined,
          supplierName: supplierName || undefined,
          emissionDate: emissionDate ? new Date(emissionDate).toISOString() : undefined,
          externalSubtotal: externalSubtotal ? Number(externalSubtotal) : undefined,
          externalTax: externalTax ? Number(externalTax) : undefined,
          externalTotal: externalTotal ? Number(externalTotal) : undefined,
          ingestionMethod,
        },
      });

      setSuccess(true);
      onSaved({ hasExternalVoucher: true, externalNumber: externalNumber || undefined });
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const downloadHref = attachmentUrl ? `${API_BASE}${attachmentUrl}` : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden border border-outline-variant/30 flex-shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-lg py-md border-b border-surface-container-high">
          <h2 className="font-headline-md text-headline-md text-on-surface truncate">
            Documento del Proveedor
          </h2>
          <button onClick={onClose} className="text-outline hover:text-on-surface transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-lg py-md space-y-md max-h-[70vh] overflow-y-auto font-body-md text-body-md text-on-surface">
          <p className="text-on-surface-variant">{documentLabel}</p>

          {success && (
            <div className="bg-tertiary-container text-on-tertiary-container px-md py-sm rounded-lg text-center font-medium">
              ✓ Documento registrado correctamente
            </div>
          )}

          {/* Number */}
          <label className="block">
            <span className="text-label-sm text-on-surface-variant uppercase">Nº Documento proveedor</span>
            <input
              value={externalNumber}
              onChange={(e) => setExternalNumber(e.target.value)}
              placeholder="Ej: R-0001, F-1234"
              className="mt-1 w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm font-body-md focus:ring-2 focus:ring-primary outline-none"
            />
          </label>

          {/* Date */}
          <label className="block">
            <span className="text-label-sm text-on-surface-variant uppercase">Fecha de emisión</span>
            <input
              type="date"
              value={emissionDate}
              onChange={(e) => setEmissionDate(e.target.value)}
              className="mt-1 w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm font-body-md focus:ring-2 focus:ring-primary outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-md">
            {/* CUIT */}
            <label className="block">
              <span className="text-label-sm text-on-surface-variant uppercase">CUIT proveedor</span>
              <input
                value={supplierCuit}
                onChange={(e) => setSupplierCuit(e.target.value)}
                placeholder="20-30112233-4"
                className="mt-1 w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm font-body-md focus:ring-2 focus:ring-primary outline-none"
              />
            </label>

            {/* Razón social */}
            <label className="block">
              <span className="text-label-sm text-on-surface-variant uppercase">Razón social</span>
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Proveedor S.A."
                className="mt-1 w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm font-body-md focus:ring-2 focus:ring-primary outline-none"
              />
            </label>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-md">
            <label className="block">
              <span className="text-label-sm text-on-surface-variant uppercase">Subtotal ext.</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={externalSubtotal}
                onChange={(e) => setExternalSubtotal(e.target.value)}
                className="mt-1 w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm font-body-md focus:ring-2 focus:ring-primary outline-none"
              />
            </label>
            <label className="block">
              <span className="text-label-sm text-on-surface-variant uppercase">IVA ext.</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={externalTax}
                onChange={(e) => setExternalTax(e.target.value)}
                className="mt-1 w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm font-body-md focus:ring-2 focus:ring-primary outline-none"
              />
            </label>
            <label className="block">
              <span className="text-label-sm text-on-surface-variant uppercase">Total ext.</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={externalTotal}
                onChange={(e) => setExternalTotal(e.target.value)}
                className="mt-1 w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm font-body-md focus:ring-2 focus:ring-primary outline-none"
              />
            </label>
          </div>

          {/* Ingestion method */}
          <label className="block">
            <span className="text-label-sm text-on-surface-variant uppercase">Método de ingreso</span>
            <select
              value={ingestionMethod}
              onChange={(e) => setIngestionMethod(e.target.value as 'manual' | 'lector' | 'ocr')}
              className="mt-1 w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-md py-sm font-body-md focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="manual">{INGESTION_LABELS.manual}</option>
              <option value="lector">{INGESTION_LABELS.lector}</option>
              <option value="ocr">{INGESTION_LABELS.ocr}</option>
            </select>
          </label>

          {/* File upload */}
          <div>
            <span className="text-label-sm text-on-surface-variant uppercase">Adjunto del documento</span>
            <div className="mt-1 flex items-center gap-sm">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={() => {}}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-sm px-md py-xs bg-surface-container-high rounded-lg hover:bg-surface-container-highest cursor-pointer transition-colors border border-outline-variant/30"
              >
                <span className="material-symbols-outlined text-[16px] mr-1 align-middle">upload_file</span>
                Seleccionar archivo
              </button>
              {fileRef.current?.files?.[0] && (
                <span className="text-on-surface-variant truncate text-sm">{fileRef.current.files[0].name}</span>
              )}
            </div>
            {attachmentUrl && !fileRef.current?.files?.[0] && (
              <a
                href={downloadHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-xs text-primary text-sm hover:underline"
              >
                <span className="material-symbols-outlined text-[16px]">visibility</span>
                Ver adjunto actual
              </a>
            )}
            {data.verifiedByName && (
              <p className="text-xs text-on-surface-variant mt-1">
                Verificado por {data.verifiedByName}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-lg py-md border-t border-surface-container-high">
          {error && <p className="text-error text-sm flex-1 mr-md">{error}</p>}
          <div className="flex gap-sm ml-auto">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-md py-sm rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors text-sm cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || success}
              className="px-md py-sm rounded-lg bg-primary text-on-primary hover:opacity-90 transition-opacity text-sm font-medium cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Guardando…' : success ? '✓ Guardado' : 'Guardar documento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
