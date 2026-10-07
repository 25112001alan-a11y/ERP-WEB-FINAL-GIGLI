/**
 * AFIP QR payload builder (simulation).
 *
 * The format follows the official AFIP "código QR" spec: a JSON object,
 * base64-encoded, appended to the AFIP URL. The result only identifies this
 * invoice internally as a SIMULATION — it never passes through AFIP and has
 * no fiscal validity. Payload fields (ver, fecha, cuit, ptoVta, tipoCmp,
 * nroCmp, importe, moneda, ctz, tipoDocRec, nroDocRec, cae, imptoTotal,
 * imptoTotConc, imptoTrib, imptoIVA) follow the AFIP reference.
 */

export interface AfipQrInput {
  /** ISO 8601 date with offset, e.g. 2026-10-07T12:00:00-03:00. */
  fecha: string;
  /** Emitter CUIT, digits only. */
  cuit: string;
  ptoVta: number;
  /** AFIP document class code (see afipTipoCmp). */
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  /** ISO 4217 code. */
  moneda: string;
  /** Exchange rate vs the invoice currency (1 for ARS). */
  ctz: number;
  /** Receiver document type: 80 (CUIT), 86 (CUIL), 96 (DNI)... */
  tipoDocRec: number;
  /** Receiver document number. */
  nroDocRec: string;
  cae: string;
  imptoTotal: number;
  imptoTotConc?: number;
  imptoTrib?: number;
  imptoIVA: number;
}

/** AFIP class by invoice letter: A=1, B=6, C=11, M=51. */
export function afipTipoCmp(invoiceType: string): number {
  switch (invoiceType.toUpperCase()) {
    case 'A': return 1;
    case 'B': return 6;
    case 'C': return 11;
    case 'M': return 51;
    default: return 1;
  }
}

/** 80 (CUIT) for 11-digit ids, 96 (DNI) otherwise. */
export function afipTipoDocRec(taxId: string): number {
  return taxId.replace(/\D/g, '').length === 11 ? 80 : 96;
}

function money(value: number): string {
  return value.toFixed(2);
}

export function afipQrPayload(input: AfipQrInput): string {
  const json = JSON.stringify({
    ver: 1,
    fecha: input.fecha,
    cuit: input.cuit,
    ptoVta: input.ptoVta,
    tipoCmp: input.tipoCmp,
    nroCmp: input.nroCmp,
    importe: money(input.importe),
    moneda: input.moneda.toUpperCase(),
    ctz: String(input.ctz),
    tipoDocRec: input.tipoDocRec,
    nroDocRec: input.nroDocRec,
    cae: input.cae,
    imptoTotal: money(input.imptoTotal),
    imptoTotConc: money(input.imptoTotConc ?? 0),
    imptoTrib: money(input.imptoTrib ?? 0),
    imptoIVA: money(input.imptoIVA),
  });
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(json)}`;
}