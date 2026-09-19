import { TransactionType } from '../types';

export type RootStackParamList = {
  Tabs: undefined;
  TransactionEntry: { transactionId?: string; initialType?: TransactionType };
  CategoryDetail: { categoryId: string };
  AccountForm: { accountId?: string };
  CategoryForm: { categoryId?: string; type: 'expense' | 'income' };
  BudgetForm: { categoryId: string };
  Login: undefined;
  PhoneLogin: undefined;
  Account: undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  Transactions: undefined;
  Budgets: undefined;
  Analytics: undefined;
  Settings: undefined;
};
