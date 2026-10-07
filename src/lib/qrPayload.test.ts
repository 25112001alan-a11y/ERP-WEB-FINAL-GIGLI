import { describe, expect, it } from 'vitest';
import { afipQrPayload, afipTipoCmp, afipTipoDocRec } from './qrPayload';

describe('afipQrPayload', () => {
  it('builds an AFIP-shaped QR URL with a base64 JSON payload', () => {
    const prefix = 'https://www.afip.gob.ar/fe/qr/?p=';
    const url = afipQrPayload({
      fecha: '2026-10-07T12:00:00-03:00',
      cuit: '30112233444',
      ptoVta: 4,
      tipoCmp: 1,
      nroCmp: 42,
      importe: 1234.5,
      moneda: 'ARS',
      ctz: 1,
      tipoDocRec: 80,
      nroDocRec: '30000000009',
      cae: '70123456789654',
      imptoTotal: 1234.5,
      imptoIVA: 214.31,
    });
    expect(url.startsWith(prefix)).toBe(true);
    const payload = JSON.parse(atob(url.slice(prefix.length)));
    expect(payload).toMatchObject({
      ver: 1,
      fecha: '2026-10-07T12:00:00-03:00',
      cuit: '30112233444',
      ptoVta: 4,
      tipoCmp: 1,
      nroCmp: 42,
      importe: '1234.50',
      moneda: 'ARS',
      ctz: '1',
      tipoDocRec: 80,
      nroDocRec: '30000000009',
      cae: '70123456789654',
      imptoTotal: '1234.50',
      imptoTotConc: '0.00',
      imptoTrib: '0.00',
      imptoIVA: '214.31',
    });
  });

  it('pads totals with two decimals and never adds thousands separators', () => {
    const payload = JSON.parse(
      atob(
        afipQrPayload({
          fecha: '2026-10-07T12:00:00-03:00',
          cuit: '30112233444',
          ptoVta: 1,
          tipoCmp: 6,
          nroCmp: 7,
          importe: 104562.9,
          moneda: 'usd',
          ctz: 350,
          tipoDocRec: 96,
          nroDocRec: '30112233',
          cae: '70123456789654',
          imptoTotal: 104562.9,
          imptoIVA: 18145.72,
        }).replace(/^https:\/\/www\.afip\.gob\.ar\/fe\/qr\/\?p=/, ''),
      ),
    );
    expect(payload.importe).toBe('104562.90');
    expect(payload.moneda).toBe('USD');
    expect(payload.ctz).toBe('350');
  });

  it('maps invoice letters to AFIP class codes and defaults unknown to 1', () => {
    expect(afipTipoCmp('A')).toBe(1);
    expect(afipTipoCmp('b')).toBe(6);
    expect(afipTipoCmp('C')).toBe(11);
    expect(afipTipoCmp('M')).toBe(51);
    expect(afipTipoCmp('X')).toBe(1);
  });

  it('detects CUIT vs DNI receivers from the tax id', () => {
    expect(afipTipoDocRec('30-30112233-4')).toBe(80);
    expect(afipTipoDocRec('30112233')).toBe(96);
    expect(afipTipoDocRec('')).toBe(96);
  });
});