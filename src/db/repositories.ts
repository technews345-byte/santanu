import { getDb } from './client';
import { Account, Budget, Category, Transaction } from '../types';

function rowToAccount(row: any): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    icon: row.icon,
    initialBalance: row.initialBalance,
    currency: row.currency,
    archived: !!row.archived,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

function rowToCategory(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    icon: row.icon,
    archived: !!row.archived,
    sortOrder: row.sortOrder,
  };
}

function rowToTransaction(row: any): Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    note: row.note,
    date: row.date,
    attachments: JSON.parse(row.attachments || '[]'),
    recurrence: row.recurrence,
    nextOccurrence: row.nextOccurrence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToBudget(row: any): Budget {
  return {
    id: row.id,
    categoryId: row.categoryId,
    monthKey: row.monthKey,
    amount: row.amount,
    isRecurring: !!row.isRecurring,
  };
}

// A delete has to reach the user's other devices, so rows are tombstoned
// rather than removed. Reads skip tombstones; sync still sees them.
async function softDelete(table: string, id: string) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(`UPDATE ${table} SET deletedAt = ?, updatedAt = ?, dirty = 1 WHERE id = ?`, [now, now, id]);
}

export const AccountsRepo = {
  async list(): Promise<Account[]> {
    const db = await getDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM accounts WHERE deletedAt IS NULL ORDER BY sortOrder ASC, createdAt ASC'
    );
    return rows.map(rowToAccount);
  },
  async upsert(account: Account): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, color, icon, initialBalance, currency, archived, sortOrder, createdAt, updatedAt, dirty, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, color=excluded.color,
         icon=excluded.icon, initialBalance=excluded.initialBalance, currency=excluded.currency,
         archived=excluded.archived, sortOrder=excluded.sortOrder, updatedAt=excluded.updatedAt,
         dirty=1, deletedAt=NULL`,
      [
        account.id,
        account.name,
        account.type,
        account.color,
        account.icon,
        account.initialBalance,
        account.currency,
        account.archived ? 1 : 0,
        account.sortOrder,
        account.createdAt,
        new Date().toISOString(),
      ]
    );
  },
  async remove(id: string): Promise<void> {
    await softDelete('accounts', id);
  },
};

export const CategoriesRepo = {
  async list(): Promise<Category[]> {
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM categories WHERE deletedAt IS NULL ORDER BY sortOrder ASC');
    return rows.map(rowToCategory);
  },
  async upsert(category: Category): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO categories (id, name, type, color, icon, archived, sortOrder, createdAt, updatedAt, dirty, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, color=excluded.color,
         icon=excluded.icon, archived=excluded.archived, sortOrder=excluded.sortOrder,
         updatedAt=excluded.updatedAt, dirty=1, deletedAt=NULL`,
      [category.id, category.name, category.type, category.color, category.icon, category.archived ? 1 : 0, category.sortOrder, now, now]
    );
  },
  async remove(id: string): Promise<void> {
    await softDelete('categories', id);
  },
};

export const TransactionsRepo = {
  async list(): Promise<Transaction[]> {
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM transactions WHERE deletedAt IS NULL ORDER BY date DESC');
    return rows.map(rowToTransaction);
  },
  async upsert(tx: Transaction): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO transactions
        (id, type, amount, currency, accountId, toAccountId, categoryId, note, date, attachments, recurrence, nextOccurrence, createdAt, updatedAt, dirty, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)
       ON CONFLICT(id) DO UPDATE SET type=excluded.type, amount=excluded.amount, currency=excluded.currency,
         accountId=excluded.accountId, toAccountId=excluded.toAccountId, categoryId=excluded.categoryId,
         note=excluded.note, date=excluded.date, attachments=excluded.attachments, recurrence=excluded.recurrence,
         nextOccurrence=excluded.nextOccurrence, updatedAt=excluded.updatedAt, dirty=1, deletedAt=NULL`,
      [
        tx.id,
        tx.type,
        tx.amount,
        tx.currency,
        tx.accountId,
        tx.toAccountId,
        tx.categoryId,
        tx.note,
        tx.date,
        JSON.stringify(tx.attachments ?? []),
        tx.recurrence,
        tx.nextOccurrence,
        tx.createdAt,
        tx.updatedAt,
      ]
    );
  },
  async remove(id: string): Promise<void> {
    await softDelete('transactions', id);
  },
};

export const BudgetsRepo = {
  async list(): Promise<Budget[]> {
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM budgets WHERE deletedAt IS NULL');
    return rows.map(rowToBudget);
  },
  async upsert(budget: Budget): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO budgets (id, categoryId, monthKey, amount, isRecurring, createdAt, updatedAt, dirty, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL)
       ON CONFLICT(categoryId, monthKey) DO UPDATE SET amount=excluded.amount, isRecurring=excluded.isRecurring,
         updatedAt=excluded.updatedAt, dirty=1, deletedAt=NULL`,
      [budget.id, budget.categoryId, budget.monthKey, budget.amount, budget.isRecurring ? 1 : 0, now, now]
    );
  },
  async remove(id: string): Promise<void> {
    await softDelete('budgets', id);
  },
};
