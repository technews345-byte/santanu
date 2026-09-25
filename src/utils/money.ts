import { DEFAULT_CURRENCY } from './finance';

/** A real minus sign: a hyphen is shorter and sits lower than the digits. */
export const MINUS = '−';
/** Narrow no-break space, so a sign never wraps away from its figure. */
const GAP = ' ';

/**
 * Money as it is read on screen.
 *
 * Whole amounts drop their `.00` — on a list of prices the zeros are noise the
 * eye has to skip — while anything with paise keeps both digits, so nothing is
 * ever rounded away. Exports keep using `formatCurrency`, which always shows
 * two decimals, because a report is a record rather than a glance.
 */
export function formatMoney(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  sign: '+' | '-' | null = amount < 0 ? '-' : null
): string {
  const abs = Math.abs(amount);
  const whole = Math.abs(abs - Math.round(abs)) < 0.005;
  const digits = whole ? 0 : 2;
  let body: string;
  try {
    body = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(whole ? Math.round(abs) : abs);
  } catch {
    body = `${abs.toFixed(digits)} ${currency}`;
  }
  if (sign === '+') return `+${GAP}${body}`;
  if (sign === '-') return `${MINUS}${GAP}${body}`;
  return body;
}

/**
 * A figure that has to fit a small tile. Exact up to a lakh — a tile has room
 * for ₹45,000 and people want their actual spend, not a rounded one — then
 * ₹1.2L and ₹3.4Cr, the way a rupee amount that size is said.
 */
export function formatCompact(amount: number, currency: string = DEFAULT_CURRENCY): string {
  const abs = Math.abs(amount);
  const neg = amount < 0 ? MINUS : '';
  if (abs < 1e5) return neg + formatMoney(abs, currency, null);
  const symbol = formatMoney(0, currency, null).replace(/[\d.,\s]/g, '');
  const units: [number, string][] = [
    [1e7, 'Cr'],
    [1e5, 'L'],
  ];
  for (const [size, unit] of units) {
    if (abs >= size) {
      const n = abs / size;
      const text = n >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, '');
      return `${neg}${symbol}${text}${unit}`;
    }
  }
  return neg + formatMoney(abs, currency, null);
}
