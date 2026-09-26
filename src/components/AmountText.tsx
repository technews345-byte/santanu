import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import { Text } from '../theme/type';
import { useTheme } from '../theme/ThemeContext';
import { DEFAULT_CURRENCY } from '../utils/finance';
import { formatMoney } from '../utils/money';
import { TransactionType } from '../types';

/**
 * A transaction's amount, signed and coloured by what it did to the balance.
 *
 * The sign is written out — `+ ₹5,000`, `− ₹450` — so direction never rests
 * on colour alone, and the colours are the validated income/expense pair, so
 * the two stay apart for colour-blind readers too.
 */
export function AmountText({
  amount,
  type,
  currency = DEFAULT_CURRENCY,
  style,
}: {
  amount: number;
  type: TransactionType;
  currency?: string;
  style?: StyleProp<TextStyle>;
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
  const sign = type === 'income' ? '+' : type === 'expense' || type === 'investment' ? '-' : null;
  return (
    <Text style={[{ color, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.2 }, style]}>
      {formatMoney(Math.abs(amount), currency, sign)}
    </Text>
  );
}
