/**
 * The words Spendly speaks in: the evening reminder, and the line that
 * confirms a save.
 *
 * Reminders come in English and Hinglish. Some are about a particular kind
 * of spending — groceries, shopping — and those are only used for someone
 * who actually spends that way, so a nudge about the weekly shop never goes
 * to someone who has never logged one.
 */

export type ReminderLanguage = 'en' | 'hi' | 'mix';

/** What a person spends on, for the reminders that name it. */
export type SpendingFocus = { groceries: boolean; shopping: boolean };

type Line = { text: string; lang: 'en' | 'hi'; about?: 'groceries' | 'shopping' };

const REMINDERS: Line[] = [
  // Groceries
  { text: 'Did you add your grocery expense?', lang: 'en', about: 'groceries' },
  { text: 'Don’t forget to track your grocery spending!', lang: 'en', about: 'groceries' },
  { text: 'Aaj ka grocery expense add kiya kya? 🛒', lang: 'hi', about: 'groceries' },

  // Shopping
  { text: 'Did you go shopping today? 🛍️', lang: 'en', about: 'shopping' },
  { text: 'Any shopping expenses today?', lang: 'en', about: 'shopping' },
  { text: 'Went shopping today? Don’t forget to track it!', lang: 'en', about: 'shopping' },
  { text: 'Shopping done? Track your expense! 🛒', lang: 'en', about: 'shopping' },
  { text: 'Quick check: Any shopping expenses today?', lang: 'en', about: 'shopping' },
  { text: 'Aaj shopping ki? Expense add kiya? 🛍️', lang: 'hi', about: 'shopping' },
  { text: 'Shopping ho gayi? Expense bhi add kar do!', lang: 'hi', about: 'shopping' },

  // Any day, anyone
  { text: 'How did today’s spending go? Add it in a tap. 💸', lang: 'en' },
  { text: 'Quick check: spent anything today?', lang: 'en' },
  { text: 'A few seconds now saves guessing later. Log today’s spends!', lang: 'en' },
  { text: 'Small or big, every expense counts. Track it now! 💰', lang: 'en' },
  { text: 'Aaj kitna kharcha hua? Track kar lo! 💸', lang: 'hi' },
  { text: 'Paise kahan gaye? Ek baar check kar lo! 👀', lang: 'hi' },
  { text: 'Kharcha chhota ho ya bada, track karna zaroori hai!', lang: 'hi' },
  { text: 'Aaj kuch kharida? Expense add karna mat bhoolna!', lang: 'hi' },
  { text: 'Budget ka dhyaan rakho, kharchon ko track karo! 💰', lang: 'hi' },
  { text: 'Aaj ka kharcha note kiya ya nahi? 😄', lang: 'hi' },
  { text: 'Spend toh ho gaya, ab track bhi kar lo! 😉', lang: 'hi' },
];

/** The reminders open to someone, in a stable order. */
export function reminderPool(language: ReminderLanguage, focus: SpendingFocus): string[] {
  return REMINDERS.filter(
    (line) =>
      (language === 'mix' || line.lang === language) &&
      (!line.about || focus[line.about])
  ).map((line) => line.text);
}

/**
 * The reminder for a given day. Chosen from the day itself rather than at
 * random, so rescheduling never changes a day's message, and stepped through
 * the pool so the same line doesn't come back on consecutive days.
 */
export function reminderFor(dayNumber: number, pool: string[]): string {
  if (pool.length === 0) return 'Aaj ka kharcha note kiya ya nahi? 😄';
  // A stride coprime with the pool's length visits every line before any
  // repeats, in an order that doesn't read as a list.
  let stride = 7;
  while (gcd(stride, pool.length) !== 1) stride += 1;
  return pool[(((dayNumber * stride) % pool.length) + pool.length) % pool.length];
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** A glyph for a category, by the icon it wears. */
const EMOJI: Record<string, string> = {
  cart: '🛒',
  bag: '🛍️',
  restaurant: '🍽️',
  car: '🚗',
  flame: '⛽',
  flash: '💡',
  heart: '💊',
  medkit: '💊',
  film: '🎬',
  repeat: '🔁',
  home: '🏠',
  school: '📚',
  book: '📚',
  airplane: '✈️',
  card: '💳',
  'shield-checkmark': '🛡️',
  business: '🏦',
  sparkles: '✨',
  gift: '🎁',
  cash: '💰',
  wallet: '💰',
  laptop: '💻',
  'trending-up': '📈',
  'bar-chart': '📈',
  'pie-chart': '📈',
  diamond: '💎',
};

function emojiFor(icon?: string): string {
  if (!icon) return '';
  return EMOJI[icon.replace(/-outline$|-sharp$/, '')] ?? '';
}

/**
 * What to say when something is saved: "Grocery expense added 🛒". Named
 * after the category, in the singular a person would say it in.
 */
export function savedMessage({
  type,
  categoryName,
  categoryIcon,
  edited,
  variant = 0,
}: {
  type: 'expense' | 'income' | 'investment' | 'transfer';
  categoryName?: string;
  categoryIcon?: string;
  edited: boolean;
  /** Which of the two phrasings; alternated so it doesn't read as canned. */
  variant?: number;
}): string {
  if (edited) return 'Changes saved ✓';
  if (type === 'transfer') return 'Transfer recorded 🔁';
  const name = categoryName ? spoken(categoryName) : '';
  const emoji = emojiFor(categoryIcon);
  let subject: string;
  if (type === 'income') subject = name || 'Income';
  else if (type === 'investment') subject = name ? `${name} investment` : 'Investment';
  else subject = name ? `${name} expense` : 'Expense';
  return variant % 2 === 1 ? `${subject} recorded successfully.` : `${subject} added${emoji ? ` ${emoji}` : ''}`;
}

/** "Groceries" → "Grocery"; other names as written. */
function spoken(name: string): string {
  const singular: Record<string, string> = {
    groceries: 'Grocery',
    utilities: 'Utility',
    subscriptions: 'Subscription',
    gifts: 'Gift',
    returns: 'Returns',
  };
  const key = name.trim().toLowerCase();
  if (singular[key]) return singular[key];
  if (key === 'other') return '';
  // As the person wrote it: "SIP", "EMI" and "Food & Dining" stay as they are.
  return name.trim();
}
