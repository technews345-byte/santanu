export type TransactionType = 'expense' | 'income' | 'transfer' | 'investment';

export type CategoryType = 'expense' | 'income' | 'investment';

export type AccountType = 'cash' | 'checking' | 'savings' | 'credit_card' | 'wallet' | 'bank';

export type RecurrenceInterval = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type PeriodKey = 'day' | 'week' | 'month' | 'year';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  color: string;
  icon: string;
  initialBalance: number;
  currency: string;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
  archived: boolean;
  sortOrder: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  note: string;
  date: string; // ISO timestamp
  attachments: string[]; // local URIs
  recurrence: RecurrenceInterval;
  nextOccurrence: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  monthKey: string; // YYYY-MM, 'recurring' applies every month if isRecurring true
  amount: number;
  isRecurring: boolean;
}

export interface AppSettings {
  biometricLockEnabled: boolean;
  baseCurrency: string;
  activeAccountId: string | null; // null = All Accounts
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  checking: 'Checking',
  savings: 'Savings',
  credit_card: 'Credit Card',
  wallet: 'Wallet',
  bank: 'Bank',
};

export const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  cash: 'cash-outline',
  checking: 'card-outline',
  savings: 'wallet-outline',
  credit_card: 'card',
  wallet: 'wallet',
  bank: 'business-outline',
};
