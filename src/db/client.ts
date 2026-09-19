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

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

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

// Added after the first release. Each batch keeps its own migration key so it
// still reaches installs that already applied the earlier ones.
const ADDED_EXPENSE_CATEGORIES = [
  { id: 'cat-loan', name: 'Loan', color: '#0891B2', icon: 'business-outline' },
  { id: 'cat-emi', name: 'EMI', color: '#7E22CE', icon: 'card-outline' },
  { id: 'cat-insurance', name: 'Insurance', color: '#059669', icon: 'shield-checkmark-outline' },
];

const CREDIT_CARD_CATEGORY = [
  { id: 'cat-credit-card', name: 'Credit Card', color: '#E11D48', icon: 'card' },
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
  ...ADDED_EXPENSE_CATEGORIES,
  ...CREDIT_CARD_CATEGORY,
  { id: 'cat-other-expense', name: 'Other', color: '#94A3B8', icon: 'ellipsis-horizontal-outline' },
];

const DEFAULT_INCOME_CATEGORIES = [
  { id: 'cat-salary', name: 'Salary', color: '#10B981', icon: 'cash-outline' },
  { id: 'cat-freelance', name: 'Freelance', color: '#0EA5E9', icon: 'laptop-outline' },
  { id: 'cat-investment', name: 'Returns', color: '#6366F1', icon: 'trending-up-outline' },
  { id: 'cat-gift', name: 'Gifts', color: '#EC4899', icon: 'gift-outline' },
  { id: 'cat-other-income', name: 'Other', color: '#94A3B8', icon: 'ellipsis-horizontal-outline' },
];

const DEFAULT_INVESTMENT_CATEGORIES = [
  { id: 'cat-inv-mutual', name: 'Mutual Funds', color: '#8B5CF6', icon: 'pie-chart-outline' },
  { id: 'cat-inv-stocks', name: 'Stocks', color: '#0EA5E9', icon: 'trending-up-outline' },
  { id: 'cat-inv-sip', name: 'SIP', color: '#14B8A6', icon: 'repeat-outline' },
  { id: 'cat-inv-gold', name: 'Gold', color: '#F59E0B', icon: 'diamond-outline' },
  { id: 'cat-inv-fd', name: 'Fixed Deposit', color: '#3B82F6', icon: 'lock-closed-outline' },
  { id: 'cat-inv-ppf', name: 'PPF / EPF', color: '#10B981', icon: 'shield-checkmark-outline' },
  { id: 'cat-inv-crypto', name: 'Crypto', color: '#F97316', icon: 'logo-bitcoin' },
  { id: 'cat-inv-property', name: 'Property', color: '#A855F7', icon: 'business-outline' },
  { id: 'cat-inv-other', name: 'Other', color: '#94A3B8', icon: 'ellipsis-horizontal-outline' },
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

  // Seeded per type rather than per table, so a type added in a later version
  // also reaches installs that already have categories.
  await seedCategoryType(db, 'expense', DEFAULT_EXPENSE_CATEGORIES);
  await seedCategoryType(db, 'income', DEFAULT_INCOME_CATEGORIES);
  await seedCategoryType(db, 'investment', DEFAULT_INVESTMENT_CATEGORIES);

  await addExpenseCategories(db, 'add-loan-emi-insurance', ADDED_EXPENSE_CATEGORIES);
  await addExpenseCategories(db, 'add-credit-card', CREDIT_CARD_CATEGORY);
}

async function addExpenseCategories(
  db: SQLite.SQLiteDatabase,
  key: string,
  categories: { id: string; name: string; color: string; icon: string }[]
) {
  await runOnce(db, key, async () => {
    const row = await db.getFirstAsync<{ max: number | null }>(
      `SELECT MAX(sortOrder) as max FROM categories WHERE type = 'expense'`
    );
    let order = (row?.max ?? -1) + 1;
    for (const c of categories) {
      await db.runAsync(
        `INSERT OR IGNORE INTO categories (id, name, type, color, icon, archived, sortOrder)
         VALUES (?, ?, 'expense', ?, ?, 0, ?)`,
        [c.id, c.name, c.color, c.icon, order++]
      );
    }
  });
}

// Recorded so a migration never runs twice — otherwise a category the user
// deleted would reappear on the next launch.
async function runOnce(db: SQLite.SQLiteDatabase, key: string, migrate: () => Promise<void>) {
  const done = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  if (done) return;
  await migrate();
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, new Date().toISOString()]);
}

async function seedCategoryType(
  db: SQLite.SQLiteDatabase,
  type: string,
  defaults: { id: string; name: string; color: string; icon: string }[]
) {
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories WHERE type = ?', [
    type,
  ]);
  if ((existing?.count ?? 0) > 0) return;

  let order = 0;
  for (const c of defaults) {
    await db.runAsync(
      `INSERT INTO categories (id, name, type, color, icon, archived, sortOrder) VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [c.id, c.name, type, c.color, c.icon, order++]
    );
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
