import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { addMonths, format, subMonths } from 'date-fns';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { IconBadge } from '../components/IconBadge';
import { ProgressBar } from '../components/ProgressBar';
import { GlassPressable } from '../components/glass/GlassPressable';
import { EmptyState } from '../components/EmptyState';
import { QuickAddFab } from '../components/QuickAddFab';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { daysRemainingInMonth, monthKeyFor, periodInterval, transactionsInRange } from '../utils/finance';
import { formatMoney } from '../utils/money';
import { Figure } from '../components/Figure';
import { budgetRows, budgetTotals } from '../utils/insights';

export default function BudgetsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { categories, transactions, budgets, activeAccountId } = useStore();
  const [anchor, setAnchor] = useState(new Date());

  const monthKey = monthKeyFor(anchor);
  const scoped = useMemo(
    () => (activeAccountId ? transactions.filter((t) => t.accountId === activeAccountId) : transactions),
    [transactions, activeAccountId]
  );
  const { start, end } = periodInterval('month', anchor);
  const monthTxns = useMemo(() => transactionsInRange(scoped, start, end), [scoped, start, end]);

  // Shared with the dashboard's budget tile, so the two always agree.
  const rows = useMemo(() => budgetRows(categories, monthTxns, budgets, monthKey), [categories, monthTxns, budgets, monthKey]);
  const totals = useMemo(() => budgetTotals(rows), [rows]);

  const remaining = totals.planned - totals.spent;
  const dailyAverage = remaining > 0 ? remaining / daysRemainingInMonth(new Date() > end ? start : new Date()) : 0;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Budgets</Text>
      </View>

      <View style={styles.anchorRow}>
        <Pressable onPress={() => setAnchor((p) => subMonths(p, 1))} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
        </Pressable>
        <Text style={[styles.anchorLabel, { color: theme.text }]}>{format(anchor, 'MMMM yyyy')}</Text>
        <Pressable onPress={() => setAnchor((p) => addMonths(p, 1))} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.category.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 168 }}
        ListHeaderComponent={
          <Card level="raised" style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Planned</Text>
                <Figure value={totals.planned} format={(n) => formatMoney(n)} fit style={[styles.summaryValue, { color: theme.text }]} />
              </View>
              <View>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Spent</Text>
                <Figure value={totals.spent} format={(n) => formatMoney(n)} fit style={[styles.summaryValue, { color: theme.expense }]} />
              </View>
              <View>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Safe/Day</Text>
                <Figure value={Math.max(dailyAverage, 0)} format={(n) => formatMoney(n)} fit style={[styles.summaryValue, { color: theme.success }]} />
              </View>
            </View>
            <View style={{ marginTop: spacing.sm }}>
              <ProgressBar progress={totals.planned > 0 ? totals.spent / totals.planned : 0} height={12} />
            </View>
          </Card>
        }
        ListEmptyComponent={<EmptyState icon="pie-chart-outline" title="No expense categories" />}
        renderItem={({ item }) => {
          const { category, spent, budget } = item;
          const hasBudget = !!budget;
          const progress = hasBudget && budget!.amount > 0 ? spent / budget!.amount : 0;
          const overspent = hasBudget && spent > budget!.amount;
          return (
            <GlassPressable
              level="row"
              blur={false}
              borderRadius={radius.lg}
              style={styles.budgetRowOuter}
              contentStyle={styles.budgetRow}
              onPress={() => navigation.navigate('BudgetForm', { categoryId: category.id })}
            >
              <View style={styles.budgetTop}>
                <IconBadge icon={category.icon as any} color={category.color} size={40} />
                <View style={styles.budgetMeta}>
                  <Text style={[styles.budgetName, { color: theme.text }]}>{category.name}</Text>
                  {hasBudget ? (
                    <Text style={[styles.budgetSub, { color: theme.textTertiary }]}>
                      {formatMoney(spent)} of {formatMoney(budget!.amount)}
                    </Text>
                  ) : (
                    <Text style={[styles.budgetSub, { color: theme.textTertiary }]}>No budget set</Text>
                  )}
                </View>
                {hasBudget ? (
                  overspent ? (
                    <Text style={[styles.overspentLabel, { color: theme.danger }]}>
                      {formatMoney(-(spent - budget!.amount))}
                    </Text>
                  ) : (
                    <Text style={[styles.remainingLabel, { color: theme.textSecondary }]}>
                      {formatMoney(budget!.amount - spent)} left
                    </Text>
                  )
                ) : (
                  <Ionicons name="add-circle-outline" size={22} color={theme.tint} />
                )}
              </View>
              {hasBudget && (
                <View style={{ marginTop: spacing.sm }}>
                  <ProgressBar progress={progress} />
                </View>
              )}
            </GlassPressable>
          );
        }}
      />
      <QuickAddFab />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  title: { fontSize: fontSizes.xl, fontWeight: '800' },
  anchorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.xs },
  anchorLabel: { fontSize: fontSizes.base, fontWeight: '700', minWidth: 140, textAlign: 'center' },
  summaryCard: { marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: fontSizes.xs, fontWeight: '600' },
  summaryValue: { fontSize: fontSizes.md, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
  budgetRowOuter: { marginBottom: spacing.sm },
  budgetRow: { padding: spacing.sm },
  budgetTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  budgetMeta: { flex: 1 },
  budgetName: { fontSize: fontSizes.base, fontWeight: '600' },
  budgetSub: { fontSize: fontSizes.xs, marginTop: 2 },
  overspentLabel: { fontSize: fontSizes.sm, fontWeight: '800' },
  remainingLabel: { fontSize: fontSizes.sm, fontWeight: '700' },
});
