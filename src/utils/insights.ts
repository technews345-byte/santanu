import { getDaysInMonth, parseISO, startOfMonth, subMonths } from 'date-fns';
import { Budget, Category, Transaction } from '../types';
import { effectiveBudgetFor, monthKeyFor, periodInterval, summarize, transactionsInRange } from './finance';

/**
 * The figures the dashboard and the budgets screen both show.
 *
 * Kept in one place so the two can never disagree: a "remaining" on the home
 * screen that differs from the one on the budgets screen is the fastest way
 * for a finance app to lose someone's trust.
 */

export interface BudgetRow {
  category: Category;
  spent: number;
  budget: Budget | undefined;
}

/** Each expense category's spend this month against its budget, if it has one. */
export function budgetRows(
  categories: Category[],
  monthTransactions: Transaction[],
  budgets: Budget[],
  monthKey: string
): BudgetRow[] {
  return categories
    .filter((c) => c.type === 'expense' && !c.archived)
    .map((c) => {
      const spent = monthTransactions
        .filter((t) => t.type === 'expense' && t.categoryId === c.id)
        .reduce((sum, t) => sum + t.amount, 0);
      return { category: c, spent, budget: effectiveBudgetFor(budgets, c.id, monthKey) };
    })
    .sort((a, b) => {
      if (a.budget && !b.budget) return -1;
      if (!a.budget && b.budget) return 1;
      return b.spent - a.spent;
    });
}

/**
 * Planned against spent across the budgeted categories only. Spending in a
 * category with no budget is not counted against the plan, since nothing was
 * planned for it.
 */
export function budgetTotals(rows: BudgetRow[]) {
  const planned = rows.reduce((sum, r) => sum + (r.budget?.amount ?? 0), 0);
  const spent = rows.reduce((sum, r) => sum + (r.budget ? r.spent : 0), 0);
  return { planned, spent, remaining: planned - spent, count: rows.filter((r) => r.budget).length };
}

/**
 * Spending so far this month, as a running total per day up to today, and the
 * whole of last month the same way, for a pace comparison.
 *
 * A running total rather than daily bars: what someone wants to know mid-month
 * is whether they are ahead of or behind where they were last time, and two
 * cumulative lines answer that at a glance.
 */
export function spendingPace(transactions: Transaction[], now: Date = new Date()) {
  const cumulative = (monthStart: Date, days: number) => {
    const daily = new Array<number>(days).fill(0);
    const { start, end } = periodInterval('month', monthStart);
    for (const t of transactionsInRange(transactions, start, end)) {
      if (t.type !== 'expense') continue;
      const day = parseISO(t.date).getDate() - 1;
      if (day >= 0 && day < days) daily[day] += t.amount;
    }
    let run = 0;
    return daily.map((v) => (run += v));
  };

  const thisStart = startOfMonth(now);
  const lastStart = subMonths(thisStart, 1);
  const thisMonth = cumulative(thisStart, getDaysInMonth(thisStart)).slice(0, now.getDate());
  const lastMonth = cumulative(lastStart, getDaysInMonth(lastStart));
  return {
    thisMonth,
    lastMonth,
    slots: getDaysInMonth(thisStart),
    monthStart: thisStart,
  };
}

/** Spend today, this week and this month, for the small tiles. */
export function spendWindows(transactions: Transaction[], now: Date = new Date()) {
  const within = (period: 'day' | 'week' | 'month') => {
    const { start, end } = periodInterval(period, now);
    return summarize(transactionsInRange(transactions, start, end)).expense;
  };
  return { today: within('day'), week: within('week'), month: within('month') };
}

export { monthKeyFor };
