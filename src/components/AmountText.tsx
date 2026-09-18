import React from 'react';
import { Text, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { DEFAULT_CURRENCY, formatCurrency } from '../utils/finance';
import { TransactionType } from '../types';

export function AmountText({
  amount,
  type,
  currency = DEFAULT_CURRENCY,
  style,
}: {
  amount: number;
  type: TransactionType;
  currency?: string;
  style?: TextStyle;
}) {
  const { theme } = useTheme();
  const color =
    type === 'income'
      ? theme.success
      : type === 'expense'
        ? theme.expense
        : type === 'investment'
          ? theme.investment
          : theme.transfer;
  const sign = type === 'income' ? '+' : type === 'expense' || type === 'investment' ? '-' : '';
  return (
    <Text style={[{ color, fontWeight: '700', fontVariant: ['tabular-nums'] }, style]}>
      {sign}
      {formatCurrency(Math.abs(amount), currency)}
    </Text>
  );
}
