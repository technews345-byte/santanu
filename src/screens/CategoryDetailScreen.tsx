import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { Screen } from '../components/Screen';
import { IconBadge } from '../components/IconBadge';
import { AmountText } from '../components/AmountText';
import { EmptyState } from '../components/EmptyState';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { formatMoney } from '../utils/money';
import { Figure } from '../components/Figure';

export default function CategoryDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { categoryId } = route.params;
  const { transactions, categories, accounts } = useStore();

  const category = categories.find((c) => c.id === categoryId);
  const items = useMemo(
    () => transactions.filter((t) => t.categoryId === categoryId).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions, categoryId]
  );
  const total = items.reduce((sum, t) => sum + t.amount, 0);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{category?.name ?? 'Category'}</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.summaryRow}>
        <IconBadge icon={(category?.icon as any) ?? 'pricetag-outline'} color={category?.color ?? theme.tint} size={56} />
        <View style={{ marginLeft: spacing.md }}>
          <Figure value={total} format={(n) => formatMoney(n)} fit style={[styles.totalValue, { color: theme.text }]} />
          <Text style={[styles.totalLabel, { color: theme.textTertiary }]}>{items.length} transactions</Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
        ListEmptyComponent={<EmptyState icon="receipt-outline" title="No transactions in this category" />}
        renderItem={({ item }) => {
          const account = accounts.find((a) => a.id === item.accountId);
          return (
            <Pressable
              style={[styles.row, { backgroundColor: theme.surface }]}
              onPress={() => navigation.navigate('TransactionEntry', { transactionId: item.id })}
            >
              <View style={styles.rowMeta}>
                <Text style={[styles.rowNote, { color: theme.text }]} numberOfLines={1}>
                  {item.note || category?.name}
                </Text>
                <Text style={[styles.rowSub, { color: theme.textTertiary }]}>
                  {account?.name} · {format(parseISO(item.date), 'MMM d, yyyy')}
                </Text>
              </View>
              <AmountText amount={item.amount} type={item.type} currency={item.currency} />
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title: { fontSize: fontSizes.md, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  totalValue: { fontSize: fontSizes.xxl, fontWeight: '800', fontVariant: ['tabular-nums'] },
  totalLabel: { fontSize: fontSizes.sm, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.xs },
  rowMeta: { flex: 1, marginRight: spacing.sm },
  rowNote: { fontSize: fontSizes.base, fontWeight: '600' },
  rowSub: { fontSize: fontSizes.xs, marginTop: 2 },
});
