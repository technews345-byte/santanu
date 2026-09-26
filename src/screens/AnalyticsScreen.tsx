import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../theme/type';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { addMonths, format, subMonths } from 'date-fns';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { IconBadge } from '../components/IconBadge';
import { DonutChart, DonutSlice } from '../components/DonutChart';
import { TrendChart } from '../components/TrendChart';
import { EmptyState } from '../components/EmptyState';
import { QuickAddFab } from '../components/QuickAddFab';
import { GlassPressable } from '../components/glass/GlassPressable';
import { GlassSurface } from '../components/glass/GlassSurface';
import { GlassTabs } from '../components/glass/GlassTabs';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { last6MonthKeys, periodInterval, summarize, transactionsInRange } from '../utils/finance';
import { formatMoney } from '../utils/money';
import { PeriodKey } from '../types';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

export default function AnalyticsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { transactions, categories, activeAccountId } = useStore();
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [anchor, setAnchor] = useState(new Date());
  const [viewType, setViewType] = useState<'expense' | 'income' | 'investment'>('expense');

  const scoped = useMemo(
    () => (activeAccountId ? transactions.filter((t) => t.accountId === activeAccountId || t.toAccountId === activeAccountId) : transactions),
    [transactions, activeAccountId]
  );

  const { start, end } = periodInterval(period, anchor);
  const periodTxns = useMemo(() => transactionsInRange(scoped, start, end), [scoped, start, end]);
  const { income, expense } = summarize(periodTxns);

  const breakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of periodTxns) {
      if (t.type !== viewType || !t.categoryId) continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
    return Array.from(map.entries())
      .map(([categoryId, value]) => {
        const cat = categories.find((c) => c.id === categoryId);
        return {
          categoryId,
          name: cat?.name ?? 'Uncategorized',
          color: cat?.color ?? theme.textTertiary,
          icon: cat?.icon ?? 'help-outline',
          value,
          pct: total > 0 ? (value / total) * 100 : 0,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [periodTxns, viewType, categories, theme.textTertiary]);

  const donutData: DonutSlice[] = breakdown.map((b) => ({ label: b.name, value: b.value, color: b.color }));

  const trendData = useMemo(() => {
    const keys = last6MonthKeys(anchor);
    return keys.map((key) => {
      const [y, m] = key.split('-').map(Number);
      const monthDate = new Date(y, m - 1, 1);
      const { start: mStart, end: mEnd } = periodInterval('month', monthDate);
      const txns = transactionsInRange(scoped, mStart, mEnd);
      const s = summarize(txns);
      return { label: format(monthDate, 'MMM'), income: s.income, expense: s.expense };
    });
  }, [scoped, anchor]);

  const shiftAnchor = (dir: 1 | -1) => {
    if (period === 'month') setAnchor((prev) => (dir === 1 ? addMonths(prev, 1) : subMonths(prev, 1)));
    else if (period === 'year') setAnchor((prev) => new Date(prev.getFullYear() + dir, prev.getMonth(), 1));
    else setAnchor((prev) => new Date(prev.getTime() + dir * 7 * 24 * 60 * 60 * 1000));
  };

  return (
    <Screen>
      <FlatList
        data={breakdown}
        keyExtractor={(item) => item.categoryId}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 168 }}
        ListHeaderComponent={
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Analytics</Text>

            <View style={styles.periodRow}>
              <GlassTabs options={PERIODS.map((p) => ({ key: p.key, label: p.label }))} value={period} onChange={setPeriod} />
            </View>

            <GlassSurface level="row" blur={false} borderRadius={radius.pill} style={styles.anchorRow} contentStyle={styles.anchorInner}>
              <Pressable onPress={() => shiftAnchor(-1)} hitSlop={10} style={styles.anchorArrow}>
                <Ionicons name="chevron-back" size={18} color={theme.textSecondary} />
              </Pressable>
              <Text style={[styles.anchorLabel, { color: theme.text }]}>
                {period === 'year' ? format(anchor, 'yyyy') : period === 'month' ? format(anchor, 'MMMM yyyy') : `Week of ${format(start, 'MMM d')}`}
              </Text>
              <Pressable onPress={() => shiftAnchor(1)} hitSlop={10} style={styles.anchorArrow}>
                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </Pressable>
            </GlassSurface>

            <View style={styles.typeToggle}>
              <GlassTabs
                options={[
                  { key: 'expense' as const, label: 'Expenses' },
                  { key: 'income' as const, label: 'Income' },
                  { key: 'investment' as const, label: 'Invested' },
                ]}
                value={viewType}
                onChange={setViewType}
              />
            </View>

            <Card level="raised" style={styles.chartCard}>
              <View style={styles.chartInner}>
              {donutData.length > 0 ? (
                <DonutChart
                  data={donutData}
                  centerLabel={viewType === 'expense' ? 'Spent' : viewType === 'income' ? 'Earned' : 'Invested'}
                />
              ) : (
                <EmptyState icon="pie-chart-outline" title="No data for this period" />
              )}
              </View>
            </Card>

            <Card level="raised" style={styles.trendCard}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Income vs. Expenses</Text>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: theme.chartIncome }]} />
                  <Text style={[styles.legendLabel, { color: theme.textSecondary }]}>Income {formatMoney(income)}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: theme.chartExpense }]} />
                  <Text style={[styles.legendLabel, { color: theme.textSecondary }]}>Expense {formatMoney(expense)}</Text>
                </View>
              </View>
              <TrendChart data={trendData} />
            </Card>

            {breakdown.length > 0 && <Text style={[styles.sectionTitle, { color: theme.text }]}>Category Breakdown</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <GlassPressable
            level="row"
            borderRadius={radius.lg}
            style={styles.rankRowOuter}
            contentStyle={styles.rankRow}
            onPress={() => navigation.navigate('CategoryDetail', { categoryId: item.categoryId })}
          >
            <IconBadge icon={item.icon as any} color={item.color} />
            <View style={styles.rankMeta}>
              <Text style={[styles.rankName, { color: theme.text }]}>{item.name}</Text>
              {/* A bar under the name turns the share into something you can
                  compare down the list without reading every figure. */}
              <View style={[styles.rankTrack, { backgroundColor: theme.borderSubtle }]}>
                <View
                  style={[
                    styles.rankFill,
                    { width: `${Math.max(2, Math.min(100, item.pct))}%`, backgroundColor: item.color },
                  ]}
                />
              </View>
            </View>
            <View style={styles.rankRight}>
              <Text style={[styles.rankValue, { color: theme.text }]}>{formatMoney(item.value)}</Text>
              <Text style={[styles.rankPct, { color: theme.textTertiary }]}>{item.pct.toFixed(1)}%</Text>
            </View>
          </GlassPressable>
        )}
      />
      <QuickAddFab />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSizes.xxl, fontWeight: '800', letterSpacing: -0.8, marginBottom: spacing.sm },
  periodRow: {},
  anchorRow: { alignSelf: 'center', marginTop: spacing.sm },
  anchorInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, paddingVertical: 6 },
  anchorArrow: { paddingHorizontal: spacing.xs },
  anchorLabel: { fontSize: fontSizes.base, fontWeight: '700', minWidth: 150, textAlign: 'center' },
  typeToggle: { marginTop: spacing.md },
  chartCard: { marginTop: spacing.md },
  chartInner: { alignItems: 'center', paddingVertical: spacing.md },
  trendCard: { marginTop: spacing.md },
  cardTitle: { fontSize: fontSizes.base, fontWeight: '800', letterSpacing: -0.2, marginBottom: spacing.sm },
  legendRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { fontSize: fontSizes.xs, fontWeight: '600' },
  sectionTitle: { fontSize: fontSizes.md, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.xs },
  rankRowOuter: { marginBottom: spacing.xs },
  rankRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: spacing.sm },
  rankTrack: { height: 5, borderRadius: radius.pill, marginTop: 6, overflow: 'hidden' },
  rankFill: { height: 5, borderRadius: radius.pill },
  rankRight: { alignItems: 'flex-end' },
  rankMeta: { flex: 1 },
  rankName: { fontSize: fontSizes.base, fontWeight: '600' },
  rankPct: { fontSize: fontSizes.xs, marginTop: 2 },
  rankValue: { fontSize: fontSizes.base, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
