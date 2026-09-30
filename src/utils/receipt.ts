/**
 * Reading a receipt: from the blocks of text the on-device recogniser finds,
 * the amount paid, the date, where it was, and what kind of spending it was.
 *
 * Receipts are messy in the same few ways, and each rule below answers one:
 *
 *  - The figure to take is what was paid, which a receipt calls many things
 *    ("Bill Amount", "Grand Total", "Net Payable") and which is usually not
 *    the first "Total" — tax is added after it. Those names outrank a plain
 *    "Total", and a later one outranks an earlier.
 *  - Recognisers often return labels and amounts as separate columns. A
 *    column of labels and a column of numbers of the same length are read
 *    back together, row by row.
 *  - Numbers that aren't money — phone numbers, GSTINs, bill numbers, dates,
 *    quantities — are kept out, and "cash tendered" and "change" are never
 *    taken for the total.
 *  - With no label to go on, the largest price on the receipt is the best
 *    guess: the total is almost always the biggest figure on it.
 */

export type ReceiptKind =
  | 'food'
  | 'groceries'
  | 'fuel'
  | 'health'
  | 'transport'
  | 'travel'
  | 'utilities'
  | 'entertainment'
  | 'shopping';

export interface ParsedReceipt {
  amount: number | null;
  date: Date | null;
  merchant: string | null;
  kind: ReceiptKind | null;
}

// What was paid, strongest first.
const PAID = /grand\s*total|net\s*(amount|payable|total|amt)|bill\s*(amount|amt|total)|amount\s*(payable|due|paid)|total\s*(payable|due|amount\s*due)|to\s*pay|payable|invoice\s*(total|amount)/i;
const TOTAL = /\btotal\b|\bttl\b/i;
const NOT_TOTAL = /sub\s*-?\s*total|total\s*(qty|quantity|items?|savings?|discount|tax|gst|weight|pcs)|(qty|items?)\s*total/i;
const NOT_MONEY_LINE = /cash\s*(tendered|received|paid)|tender|change\b|balance|round(ed)?\s*off|savings?|you\s*saved|discount/i;
const ID_LINE = /gst|gstin|\bph\b|phone|\bmob(ile)?\b|\btel\b|contact|fssai|\bcin\b|\bpan\b|\bhsn\b|\bsac\b|bill\s*no|invoice\s*no|inv\s*no|order\s*no|\btoken\b|\btable\b|\bkot\b|receipt\s*no|\btxn\b|\bref\b|a\/c|card\s*no|\bupi\b/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Cleans up the usual recogniser slips in a line of numbers. */
function normalise(line: string): string {
  return (
    line
      // O and o read for zero, between or after digits.
      .replace(/(?<=\d)[Oo](?=[\d.,\s]|$)/g, '0')
      // "1315 .00", "1315. 00" → "1315.00"
      .replace(/(\d)\s*\.\s*(\d{2})\b/g, '$1.$2')
      // A trailing "1381 00": a decimal point read as a space.
      .replace(/(\d{2,})\s(\d{2})\s*$/, '$1.$2')
      .replace(/[₹]/g, ' ₹ ')
      .trim()
  );
}

type Amount = { value: number; money: boolean };

/** The amounts on a line, in order. `money` marks those written as prices. */
function amountsIn(line: string): Amount[] {
  const out: Amount[] = [];
  const re = /(₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d/:-])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const raw = m[2];
    const before = line.slice(Math.max(0, m.index - 1), m.index);
    // Part of a date, a time or a code, not a sum.
    if (/[/:-]/.test(before)) continue;
    const value = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0 || value >= 1e7) continue;
    const digits = raw.replace(/[^\d]/g, '').length;
    const hasDecimals = /\.\d{2}$/.test(raw);
    // Long runs of digits without a decimal point are numbers, not money.
    if (!hasDecimals && digits > 6) continue;
    out.push({ value, money: hasDecimals || !!m[1] || raw.includes(',') });
  }
  return out;
}

const numberOnly = (line: string) => /^[₹\s]*(rs\.?|inr)?\s*[\d,]+(\.\d{1,2})?\s*$/i.test(line);

function findAmount(blocks: string[][]): number | null {
  type Candidate = { value: number; rank: number; order: number };
  const candidates: Candidate[] = [];
  let order = 0;
  const rankOf = (label: string) =>
    PAID.test(label) ? 3 : TOTAL.test(label) && !NOT_TOTAL.test(label) ? 2 : 0;

  // Columns of labels read against columns of numbers of the same length.
  const numericBlocks = blocks.filter((b) => b.length > 1 && b.every(numberOnly));

  blocks.forEach((block) => {
    block.forEach((line, i) => {
      order += 1;
      const rank = rankOf(line);
      if (rank === 0 || NOT_MONEY_LINE.test(line)) return;
      const own = amountsIn(line);
      if (own.length > 0) {
        candidates.push({ value: own[own.length - 1].value, rank, order });
        return;
      }
      // The value on the next line of the same block…
      const next = block[i + 1];
      if (next && numberOnly(next)) {
        const [a] = amountsIn(next);
        if (a) candidates.push({ value: a.value, rank, order });
        return;
      }
      // …or in the matching row of a parallel column of numbers.
      for (const column of numericBlocks) {
        if (column.length === block.length && column !== block) {
          const [a] = amountsIn(column[i]);
          if (a) {
            candidates.push({ value: a.value, rank, order });
            break;
          }
        }
      }
    });
  });

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.rank - a.rank || b.order - a.order);
    return round2(candidates[0].value);
  }

  // No label: the largest price, leaving out what can't be the total.
  const prices: number[] = [];
  const plain: number[] = [];
  for (const block of blocks) {
    for (const line of block) {
      if (NOT_MONEY_LINE.test(line) || ID_LINE.test(line)) continue;
      for (const a of amountsIn(line)) (a.money ? prices : plain).push(a.value);
    }
  }
  const pool = prices.length > 0 ? prices : plain;
  return pool.length > 0 ? round2(Math.max(...pool)) : null;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function findDate(text: string, now: Date): Date | null {
  const found: Date[] = [];
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  const push = (y: number, m: number, d: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    const date = new Date(y, m - 1, d, 12, 0, 0);
    if (date.getMonth() !== m - 1) return;
    found.push(date);
  };

  for (const m of text.matchAll(/\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/g)) push(Number(m[1]), Number(m[2]), Number(m[3]));
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    // Day first, as receipts here are written — unless that can't be.
    if (b > 12 && a <= 12) push(year(m[3]), a, b);
    else push(year(m[3]), b, a);
  }
  const monthRe = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s.-]*(${MONTHS.join('|')})[a-z]*[\\s.,-]*(\\d{2,4})\\b`, 'gi');
  for (const m of text.matchAll(monthRe)) push(year(m[3]), MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1, Number(m[1]));

  // A receipt is from the past, and not the distant past.
  const earliest = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
  const latest = new Date(now.getTime() + 36 * 3600 * 1000);
  const valid = found.filter((d) => d >= earliest && d <= latest);
  if (valid.length === 0) return null;

  const date = valid[0];
  // The time of day, if the receipt gives one.
  const time = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.][0-5]\d)?\s*(am|pm)?\b/i);
  if (time) {
    let h = Number(time[1]);
    const ampm = time[3]?.toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    date.setHours(h, Number(time[2]), 0, 0);
  }
  return date > latest ? null : date;
}

const GENERIC_HEADER = /^(tax\s*invoice|invoice|bill|bill\s*of\s*supply|receipt|cash\s*memo|cash\s*bill|estimate|restaurant|hotel|welcome|original|duplicate|customer\s*copy|retail\s*invoice|sales\s*invoice|kot)\b[\s.:-]*$/i;

function findMerchant(blocks: string[][]): string | null {
  const lines = blocks.flat().slice(0, 8);
  for (const raw of lines) {
    const line = raw.split(/[,|]/)[0].trim();
    const letters = (line.match(/[a-z]/gi) ?? []).length;
    if (letters < 3 || letters / Math.max(1, line.length) < 0.6) continue;
    if (GENERIC_HEADER.test(line) || ID_LINE.test(line) || /\d{4,}/.test(line)) continue;
    const name = line.replace(/\s+/g, ' ').slice(0, 40);
    return name === name.toUpperCase() ? titleCase(name) : name;
  }
  return null;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

const KIND_WORDS: Record<ReceiptKind, string[]> = {
  food: ['restaurant', 'hotel', 'cafe', 'café', 'dhaba', 'kitchen', 'food', 'biryani', 'pizza', 'burger', 'naan', 'roti', 'paneer', 'tandoor', 'dal ', 'thali', 'sweets', 'bakery', 'zomato', 'swiggy', 'steward', 'waiter', 'kot', 'chai', 'coffee', 'juice', 'meal', 'chicken', 'dine', 'table'],
  groceries: ['grocery', 'groceries', 'kirana', 'supermarket', 'super market', 'mart', 'dmart', 'd-mart', 'bigbasket', 'blinkit', 'zepto', 'reliance fresh', 'vegetable', 'fruits', 'dairy', 'milk', 'atta', 'provision', 'general store'],
  fuel: ['petrol', 'diesel', 'fuel', 'hpcl', 'bpcl', 'iocl', 'indian oil', 'bharat petroleum', 'hindustan petroleum', 'nozzle', 'litre', 'ltr'],
  health: ['pharmacy', 'medical', 'chemist', 'medicos', 'hospital', 'clinic', 'diagnostic', 'apollo', 'medplus', 'tablet', 'syrup', 'capsule'],
  transport: ['uber', 'ola ', 'rapido', 'taxi', ' cab', 'metro', 'parking', 'toll'],
  travel: ['irctc', 'railway', 'airline', 'flight', 'indigo', 'air india', 'boarding', 'pnr'],
  utilities: ['electricity', 'power bill', 'water bill', 'broadband', 'internet', 'recharge', 'prepaid', 'postpaid', 'jio', 'airtel', 'vodafone', 'bsnl', 'lpg', 'gas cylinder'],
  entertainment: ['cinema', 'pvr', 'inox', 'movie', 'theatre', 'bookmyshow', 'multiplex'],
  shopping: ['fashion', 'apparel', 'clothing', 'garment', 'footwear', 'shoes', 'mall', 'trends', 'lifestyle', 'zudio', 'westside', 'pantaloons', 'electronics', 'showroom', 'boutique'],
};

function findKind(text: string): ReceiptKind | null {
  const lower = ` ${text.toLowerCase()} `;
  let best: ReceiptKind | null = null;
  let bestScore = 0;
  for (const kind of Object.keys(KIND_WORDS) as ReceiptKind[]) {
    const score = KIND_WORDS[kind].reduce((n, word) => n + (lower.includes(word) ? 1 : 0), 0);
    if (score > bestScore) {
      best = kind;
      bestScore = score;
    }
  }
  return best;
}

/** Reads a receipt from the recogniser's text blocks. */
export function parseReceipt(textBlocks: string[], now: Date = new Date()): ParsedReceipt {
  const blocks = textBlocks
    .map((b) => b.split(/\r?\n/).map(normalise).filter(Boolean))
    .filter((b) => b.length > 0);
  const text = blocks.map((b) => b.join('\n')).join('\n');
  return {
    amount: findAmount(blocks),
    date: findDate(text, now),
    merchant: findMerchant(blocks),
    kind: findKind(text),
  };
}

/** The glyph a category wears for each kind of receipt. */
export const KIND_ICONS: Record<ReceiptKind, string[]> = {
  food: ['restaurant'],
  groceries: ['cart'],
  fuel: ['flame'],
  health: ['heart', 'medkit'],
  transport: ['car'],
  travel: ['airplane', 'car'],
  utilities: ['flash'],
  entertainment: ['film'],
  shopping: ['bag'],
};
