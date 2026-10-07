import { describe, expect, it } from 'vitest';
import { formatMoney } from './format';

describe('formatMoney', () => {
  it('defaults to ARS for numbers and Prisma Decimal strings', () => {
    expect(formatMoney('1234.50')).toContain('1.234,50');
    expect(formatMoney(1234.5)).toBe(formatMoney('1234.50'));
    expect(formatMoney('1234.50')).toContain('$');
  });

  it('labels USD without converting the amount or adding an ARS label', () => {
    expect(formatMoney('1234.50', 'USD')).toContain('1.234,50');
    expect(formatMoney('1234.50', 'USD')).toContain('US$');
    expect(formatMoney('1234.50', 'USD')).not.toContain('ARS');
  });

  it('falls back to ARS for an invalid optional currency', () => {
    expect(formatMoney('1234.50', 'invalid currency')).toBe(formatMoney('1234.50'));
  });
});
