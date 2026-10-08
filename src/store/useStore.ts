import { create } from 'zustand';
import { Account, Budget, Category, Transaction } from '../types';
import { AccountsRepo, BudgetsRepo, CategoriesRepo, TransactionsRepo } from '../db/repositories';
import { nextOccurrence } from '../utils/recurrence';
import { generateId } from '../utils/id';
import { materializeRecurring } from '../db/recurring';
import { requestSync } from '../sync/scheduler';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_ACCOUNT_KEY = 'settings:activeAccountId';
const BALANCE_VISIBLE_KEY = 'settings:balanceVisible';
const BIOMETRIC_KEY = 'settings:biometricLockEnabled';
const SUPPORT_COUNT_KEY = 'settings:supportCount';

interface StoreState {
  hydrated: boolean;
  hydrationError: string | null;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  activeAccountId: string | null; // null = All Accounts
  balanceVisible: boolean;
  biometricLockEnabled: boolean;
  /** How many rewarded ads the user has chosen to watch to support the app. */
  supportCount: number;

  hydrate: () => Promise<void>;
  setActiveAccountId: (id: string | null) => void;
  toggleBalanceVisible: () => void;
  setBiometricLockEnabled: (enabled: boolean) => void;
  recordSupport: () => void;

  addAccount: (input: Omit<Account, 'id' | 'createdAt' | 'archived' | 'sortOrder'>) => Promise<Account>;
  updateAccount: (id: string, patch: Partial<Account>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;

  addCategory: (input: Omit<Category, 'id' | 'archived' | 'sortOrder'>) => Promise<Category>;
  updateCategory: (id: string, patch: Partial<Category>) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;

  addTransaction: (input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Transaction>;
  updateTransaction: (id: string, patch: Partial<Transaction>) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  duplicateTransaction: (id: string) => Promise<void>;

  setBudget: (categoryId: string, monthKey: string, amount: number, isRecurring: boolean) => Promise<void>;
  removeBudget: (id: string) => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  hydrated: false,
  hydrationError: null,
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  activeAccountId: null,
  balanceVisible: true,
  biometricLockEnabled: false,
  supportCount: 0,

  hydrate: async () => {
    // Loading materializes due repeats idempotently; the database's setup
    // is also safe to repeat, so a transient native failure (one was
    // seen in a race inside the SQLite bridge) gets one quiet retry before
    // the error screen is shown.
    const load = async () => {
      await materializeRecurring();
      return Promise.all([
        AccountsRepo.list(),
        CategoriesRepo.list(),
        TransactionsRepo.list(),
        BudgetsRepo.list(),
        AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY),
        AsyncStorage.getItem(BALANCE_VISIBLE_KEY),
        AsyncStorage.getItem(BIOMETRIC_KEY),
        AsyncStorage.getItem(SUPPORT_COUNT_KEY),
      ]);
    };
    try {
      let loaded: Awaited<ReturnType<typeof load>>;
      try {
        loaded = await load();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 400));
        loaded = await load();
      }
      const [accounts, categories, transactions, budgets, storedActive, storedVisible, storedBiometric, storedSupport] = loaded;
      set({
        accounts,
        categories,
        transactions,
        budgets,
        activeAccountId: accounts.some((a) => a.id === storedActive) ? storedActive : null,
        balanceVisible: storedVisible === null ? true : storedVisible === 'true',
        biometricLockEnabled: storedBiometric === 'true',
        supportCount: Number(storedSupport) || 0,
        hydrated: true,
        hydrationError: null,
      });
    } catch (error: any) {
      set({ hydrated: true, hydrationError: error?.message ?? 'Failed to load your data' });
    }
  },

  setActiveAccountId: (id) => {
    set({ activeAccountId: id });
    AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, id ?? '').catch(() => {});
  },

  toggleBalanceVisible: () => {
    const next = !get().balanceVisible;
    set({ balanceVisible: next });
    AsyncStorage.setItem(BALANCE_VISIBLE_KEY, String(next)).catch(() => {});
  },

  setBiometricLockEnabled: (enabled) => {
    set({ biometricLockEnabled: enabled });
    AsyncStorage.setItem(BIOMETRIC_KEY, String(enabled)).catch(() => {});
  },

  recordSupport: () => {
    const next = get().supportCount + 1;
    set({ supportCount: next });
    AsyncStorage.setItem(SUPPORT_COUNT_KEY, String(next)).catch(() => {});
  },

  addAccount: async (input) => {
    const account: Account = {
      ...input,
      id: generateId('acc'),
      archived: false,
      sortOrder: get().accounts.length,
      createdAt: new Date().toISOString(),
    };
    await AccountsRepo.upsert(account);
    set({ accounts: [...get().accounts, account] });
    requestSync();
    return account;
  },

  updateAccount: async (id, patch) => {
    const existing = get().accounts.find((a) => a.id === id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    await AccountsRepo.upsert(updated);
    set({ accounts: get().accounts.map((a) => (a.id === id ? updated : a)) });
    requestSync();
  },

  removeAccount: async (id) => {
    await AccountsRepo.remove(id);
    if (get().activeAccountId === id) get().setActiveAccountId(null);
    requestSync();
    set({
      accounts: get().accounts.filter((a) => a.id !== id),
      activeAccountId: get().activeAccountId === id ? null : get().activeAccountId,
    });
  },

  addCategory: async (input) => {
    const category: Category = {
      ...input,
      id: generateId('cat'),
      archived: false,
      sortOrder: get().categories.filter((c) => c.type === input.type).length,
    };
    await CategoriesRepo.upsert(category);
    set({ categories: [...get().categories, category] });
    requestSync();
    return category;
  },

  updateCategory: async (id, patch) => {
    const existing = get().categories.find((c) => c.id === id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    await CategoriesRepo.upsert(updated);
    set({ categories: get().categories.map((c) => (c.id === id ? updated : c)) });
    requestSync();
  },

  removeCategory: async (id) => {
    await CategoriesRepo.remove(id);
    requestSync();
    set({ categories: get().categories.filter((c) => c.id !== id) });
  },

  addTransaction: async (input) => {
    const now = new Date().toISOString();
    const tx: Transaction = { ...input, id: generateId('txn'), createdAt: now, updatedAt: now };
    await TransactionsRepo.upsert(tx);
    set({ transactions: [tx, ...get().transactions].sort((a, b) => b.date.localeCompare(a.date)) });
    requestSync();
    return tx;
  },

  updateTransaction: async (id, patch) => {
    const existing = get().transactions.find((t) => t.id === id);
    if (!existing) return;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    await TransactionsRepo.upsert(updated);
    set({
      transactions: get()
        .transactions.map((t) => (t.id === id ? updated : t))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    });
    requestSync();
  },

  removeTransaction: async (id) => {
    await TransactionsRepo.remove(id);
    requestSync();
    set({ transactions: get().transactions.filter((t) => t.id !== id) });
  },

  duplicateTransaction: async (id) => {
    const existing = get().transactions.find((t) => t.id === id);
    if (!existing) return;
    const now = new Date().toISOString();
    const copy: Transaction = { ...existing, id: generateId('txn'), date: now, createdAt: now, updatedAt: now,
      nextOccurrence: nextOccurrence(now, existing.recurrence) };
    await TransactionsRepo.upsert(copy);
    set({ transactions: [copy, ...get().transactions] });
    requestSync();
  },

  setBudget: async (categoryId, monthKey, amount, isRecurring) => {
    const existing = get().budgets.find((b) => b.categoryId === categoryId && b.monthKey === monthKey);
    const budget: Budget = existing
      ? { ...existing, amount, isRecurring }
      : { id: generateId('bud'), categoryId, monthKey, amount, isRecurring };
    const saved = await BudgetsRepo.upsert(budget);
    requestSync();
    set({
      budgets: [...get().budgets.filter((b) => b.categoryId !== categoryId || b.monthKey !== monthKey), saved],
    });
  },

  removeBudget: async (id) => {
    await BudgetsRepo.remove(id);
    requestSync();
    set({ budgets: get().budgets.filter((b) => b.id !== id) });
  },
}));
