export type RecordTable = 'accounts' | 'categories' | 'transactions' | 'budgets';
const MONEY_LIMIT = 1e13;
const control = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function check(ok: boolean, field: string): asserts ok {
  if (!ok) throw new Error(`Invalid ${field}. Check the value and try again.`);
}
function text(value: unknown, max: number, field: string, required = false) {
  check(typeof value === 'string' && value.length <= max && !control.test(value) && (!required || value.trim().length > 0), field);
}
function optionalText(value: unknown, max: number, field: string) {
  if (value !== null && value !== undefined) text(value, max, field);
}
function money(value: unknown, positive: boolean) {
  check(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < MONEY_LIMIT && (!positive || value > 0), 'amount');
}
function date(value: unknown, field: string) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)), field);
}

/** Validate at both the local write boundary and the cloud read boundary. Text stays text. */
export function assertRecord(table: RecordTable, row: Record<string, unknown>, remote = false): void {
  text(row.id, 128, 'record ID', true);
  if (remote) {
    date(row.updatedAt, 'update date');
    if (row.deletedAt != null) date(row.deletedAt, 'deletion date');
  }
  if (table === 'accounts' || table === 'categories') {
    text(row.name, 80, 'name', true);
    check(typeof row.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(row.color), 'color');
    text(row.icon, 64, 'icon', true);
    check([0, 1, false, true].includes(row.archived as any), 'archived flag');
    check(Number.isInteger(row.sortOrder) && Number(row.sortOrder) >= 0, 'sort order');
  }
  if (table === 'accounts') {
    check(['cash', 'checking', 'savings', 'credit_card', 'wallet', 'bank'].includes(String(row.type)), 'account type');
    money(row.initialBalance, false);
    text(row.currency, 8, 'currency', true);
    date(row.createdAt, 'creation date');
  } else if (table === 'categories') {
    check(['expense', 'income', 'investment'].includes(String(row.type)), 'category type');
  } else if (table === 'budgets') {
    text(row.categoryId, 128, 'category', true);
    check(typeof row.monthKey === 'string' && /^(recurring|\d{4}-(0[1-9]|1[0-2]))$/.test(row.monthKey), 'budget month');
    money(row.amount, true);
    check([0, 1, false, true].includes(row.isRecurring as any), 'recurring flag');
  } else {
    check(['income', 'expense', 'investment', 'transfer'].includes(String(row.type)), 'transaction type');
    money(row.amount, true);
    text(row.currency, 8, 'currency', true);
    text(row.accountId, 128, 'account', true);
    optionalText(row.categoryId, 128, 'category');
    optionalText(row.toAccountId, 128, 'destination');
    if (row.type === 'transfer') check(typeof row.toAccountId === 'string' && !!row.toAccountId && row.toAccountId !== row.accountId, 'destination');
    text(row.note, 1000, 'note');
    date(row.date, 'transaction date'); date(row.createdAt, 'creation date'); date(row.updatedAt, 'update date');
    check(['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(String(row.recurrence)), 'repeat interval');
    if (row.nextOccurrence != null) date(row.nextOccurrence, 'next repeat date');
    let attachments = row.attachments;
    if (typeof attachments === 'string') {
      check(attachments.length <= 6000, 'attachments');
      try { attachments = JSON.parse(attachments); } catch { throw new Error('Invalid attachments'); }
    }
    check(Array.isArray(attachments) && attachments.every((uri) => typeof uri === 'string') && JSON.stringify(attachments).length <= 6000, 'attachments');
  }
}
