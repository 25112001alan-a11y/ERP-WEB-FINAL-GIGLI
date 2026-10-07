// Amounts can arrive as numbers or Prisma Decimal strings. Formatting never converts currency.
export function formatMoney(amount: number | string, currency = 'ARS'): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(Number(amount));
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return formatMoney(amount);
  }
}
