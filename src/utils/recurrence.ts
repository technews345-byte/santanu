import { RecurrenceInterval } from '../types';

/** Advance in local calendar time; month-end series keep their original day. */
export function nextOccurrence(date: string, recurrence: RecurrenceInterval, anchor = date): string | null {
  if (recurrence === 'none') return null;
  const next = new Date(date);
  const origin = new Date(anchor);
  if (!Number.isFinite(next.getTime()) || !Number.isFinite(origin.getTime())) return null;
  if (recurrence === 'daily') next.setDate(next.getDate() + 1);
  else if (recurrence === 'weekly') next.setDate(next.getDate() + 7);
  else if (recurrence === 'monthly' || recurrence === 'yearly') {
    next.setDate(1);
    if (recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
    else next.setFullYear(next.getFullYear() + 1, origin.getMonth());
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(origin.getDate(), lastDay));
  } else return null;
  return next.toISOString();
}
