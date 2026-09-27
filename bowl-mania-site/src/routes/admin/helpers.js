import { z, parse, ymd } from '../../lib/validate.js';
import { localParts, localToDate, sqlNow, addDays } from '../../lib/time.js';

/** Resolves a range preset or custom from/to (restaurant-local dates) to UTC SQL bounds. */
export function range(q) {
  const { preset = 'last7', from, to } = parse(z.object({ preset: z.enum(['today', 'yesterday', 'last7', 'last30', 'this_month', 'last_month', 'this_year', 'custom', 'all']).optional(), from: ymd.optional(), to: ymd.optional() }), q);
  const today = localParts().date;
  let a, b;
  switch (preset) {
    case 'today': a = b = today; break;
    case 'yesterday': a = b = addDays(today, -1); break;
    case 'last7': a = addDays(today, -6); b = today; break;
    case 'last30': a = addDays(today, -29); b = today; break;
    case 'this_month': a = today.slice(0, 8) + '01'; b = today; break;
    case 'last_month': { const first = today.slice(0, 8) + '01'; b = addDays(first, -1); a = b.slice(0, 8) + '01'; break; }
    case 'this_year': a = today.slice(0, 5) + '01-01'; b = today; break;
    case 'all': a = '2000-01-01'; b = today; break;
    case 'custom': a = from || today; b = to || a; break;
  }
  if (a > b) [a, b] = [b, a];
  return { preset, from: a, to: b, start: sqlNow(localToDate(a, '00:00')), end: sqlNow(localToDate(addDays(b, 1), '00:00')),
    days: Math.round((new Date(b) - new Date(a)) / 864e5) + 1 };
}
/** Minutes to add to a stored UTC timestamp to get restaurant-local time (for GROUP BY day/hour). */
export function tzOffsetMinutes() {
  const now = new Date();
  const local = localParts(now);
  const localMs = Date.UTC(+local.date.slice(0, 4), +local.date.slice(5, 7) - 1, +local.date.slice(8, 10), Math.floor(local.minutes / 60), local.minutes % 60);
  return Math.round((localMs - Math.floor(now.getTime() / 60000) * 60000) / 60000);
}
export function paging(q) {
  const { page, limit } = parse(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }), q);
  return { page, limit, offset: (page - 1) * limit };
}
export const likeEsc = s => `%${String(s).replace(/[\\%_]/g, m => '\\' + m)}%`;
