import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
  format,
  isWithinInterval,
  parseISO,
} from 'date-fns';
import { Account, Budget, PeriodKey, Transaction } from '../types';

export const DEFAULT_CURRENCY = 'INR';

export function formatCurrency(amount: number, currency: string = DEFAULT_CURRENCY): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function periodInterval(period: PeriodKey, anchor: Date = new Date()) {
  switch (period) {
    case 'day':
      return { start: startOfDay(anchor), end: endOfDay(anchor) };
    case 'week':
      return { start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) };
    case 'year':
      return { start: startOfYear(anchor), end: endOfYear(anchor) };
    case 'month':
    default:
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  }
}

export function transactionsInRange(transactions: Transaction[], start: Date, end: Date): Transaction[] {
  return transactions.filter((t) => {
    const d = parseISO(t.date);
    return isWithinInterval(d, { start, end });
  });
}

export function accountBalance(account: Account, transactions: Transaction[]): number {
  let balance = account.initialBalance;
  for (const t of transactions) {
    if (t.type === 'income' && t.accountId === account.id) balance += t.amount;
    else if (t.type === 'expense' && t.accountId === account.id) balance -= t.amount;
    else if (t.type === 'transfer') {
      if (t.accountId === account.id) balance -= t.amount;
      if (t.toAccountId === account.id) balance += t.amount;
    }
  }
  return balance;
}

export function totalBalance(accounts: Account[], transactions: Transaction[]): number {
  return accounts.reduce((sum, a) => sum + accountBalance(a, transactions), 0);
}

export function summarize(transactions: Transaction[]) {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

export function groupByRelativeDate(transactions: Transaction[]): { title: string; data: Transaction[] }[] {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const d = startOfDay(parseISO(t.date));
    let key: string;
    if (d.getTime() === today.getTime()) key = 'Today';
    else if (d.getTime() === yesterday.getTime()) key = 'Yesterday';
    else key = format(d, 'MMMM d, yyyy');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
}

export function monthKeyFor(date: Date = new Date()): string {
  return format(date, 'yyyy-MM');
}

export function last6MonthKeys(anchor: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    keys.push(monthKeyFor(subMonths(anchor, i)));
  }
  return keys;
}

export function daysRemainingInMonth(anchor: Date = new Date()): number {
  const end = endOfMonth(anchor);
  const diff = Math.ceil((end.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 1);
}

export const RECURRING_BUDGET_KEY = 'recurring';

export function effectiveBudgetFor(budgets: Budget[], categoryId: string, monthKey: string): Budget | undefined {
  return (
    budgets.find((b) => b.categoryId === categoryId && b.monthKey === monthKey) ??
    budgets.find((b) => b.categoryId === categoryId && b.monthKey === RECURRING_BUDGET_KEY && b.isRecurring)
  );
}
