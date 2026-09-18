import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  initialBalance REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  archived INTEGER NOT NULL DEFAULT 0,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  sortOrder INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  accountId TEXT NOT NULL,
  toAccountId TEXT,
  categoryId TEXT,
  note TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  recurrence TEXT NOT NULL DEFAULT 'none',
  nextOccurrence TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(accountId);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(categoryId);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY NOT NULL,
  categoryId TEXT NOT NULL,
  monthKey TEXT NOT NULL,
  amount REAL NOT NULL,
  isRecurring INTEGER NOT NULL DEFAULT 1,
  UNIQUE(categoryId, monthKey)
);
`;

const DEFAULT_ACCOUNTS = [
  { id: 'acc-cash', name: 'Cash', type: 'cash', color: '#10B981', icon: 'cash-outline', initialBalance: 0 },
  { id: 'acc-bank', name: 'Bank', type: 'checking', color: '#6366F1', icon: 'business-outline', initialBalance: 0 },
];

const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'cat-food', name: 'Food & Dining', color: '#F97316', icon: 'restaurant-outline' },
  { id: 'cat-groceries', name: 'Groceries', color: '#84CC16', icon: 'cart-outline' },
  { id: 'cat-transport', name: 'Transport', color: '#0EA5E9', icon: 'car-outline' },
  { id: 'cat-fuel', name: 'Fuel', color: '#F59E0B', icon: 'flame-outline' },
  { id: 'cat-utilities', name: 'Utilities', color: '#6366F1', icon: 'flash-outline' },
  { id: 'cat-shopping', name: 'Shopping', color: '#EC4899', icon: 'bag-outline' },
  { id: 'cat-health', name: 'Health', color: '#F43F5E', icon: 'heart-outline' },
  { id: 'cat-entertainment', name: 'Entertainment', color: '#A855F7', icon: 'film-outline' },
  { id: 'cat-subscriptions', name: 'Subscriptions', color: '#14B8A6', icon: 'repeat-outline' },
  { id: 'cat-housing', name: 'Housing', color: '#3B82F6', icon: 'home-outline' },
  { id: 'cat-education', name: 'Education', color: '#D946EF', icon: 'school-outline' },
  { id: 'cat-other-expense', name: 'Other', color: '#94A3B8', icon: 'ellipsis-horizontal-outline' },
];

const DEFAULT_INCOME_CATEGORIES = [
  { id: 'cat-salary', name: 'Salary', color: '#10B981', icon: 'cash-outline' },
  { id: 'cat-freelance', name: 'Freelance', color: '#0EA5E9', icon: 'laptop-outline' },
  { id: 'cat-investment', name: 'Investments', color: '#6366F1', icon: 'trending-up-outline' },
  { id: 'cat-gift', name: 'Gifts', color: '#EC4899', icon: 'gift-outline' },
  { id: 'cat-other-income', name: 'Other', color: '#94A3B8', icon: 'ellipsis-horizontal-outline' },
];

async function seedIfEmpty(db: SQLite.SQLiteDatabase) {
  const accountCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM accounts');
  if ((accountCount?.count ?? 0) === 0) {
    const now = new Date().toISOString();
    for (let i = 0; i < DEFAULT_ACCOUNTS.length; i++) {
      const a = DEFAULT_ACCOUNTS[i];
      await db.runAsync(
        `INSERT INTO accounts (id, name, type, color, icon, initialBalance, currency, archived, sortOrder, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 'INR', 0, ?, ?)`,
        [a.id, a.name, a.type, a.color, a.icon, a.initialBalance, i, now]
      );
    }
  }

  const categoryCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  if ((categoryCount?.count ?? 0) === 0) {
    let order = 0;
    for (const c of DEFAULT_EXPENSE_CATEGORIES) {
      await db.runAsync(
        `INSERT INTO categories (id, name, type, color, icon, archived, sortOrder) VALUES (?, ?, 'expense', ?, ?, 0, ?)`,
        [c.id, c.name, c.color, c.icon, order++]
      );
    }
    order = 0;
    for (const c of DEFAULT_INCOME_CATEGORIES) {
      await db.runAsync(
        `INSERT INTO categories (id, name, type, color, icon, archived, sortOrder) VALUES (?, ?, 'income', ?, ?, 0, ?)`,
        [c.id, c.name, c.color, c.icon, order++]
      );
    }
  }
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('expense_budget.db');
      await db.execAsync(SCHEMA_SQL);
      await seedIfEmpty(db);
      return db;
    })();
  }
  return dbPromise;
}
