import React, { useId, useMemo, useState } from 'react';
import { Image, Platform, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { Text } from '../theme/type';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { IconBadge } from '../components/IconBadge';
import { AmountText } from '../components/AmountText';
import { EmptyState } from '../components/EmptyState';
import { QuickAddFab } from '../components/QuickAddFab';
import { Figure } from '../components/Figure';
import { FlowChart } from '../components/FlowChart';
import { ProgressBar } from '../components/ProgressBar';
import { BottomSheetModal } from '../components/BottomSheetModal';
import { GlassPressable } from '../components/glass/GlassPressable';
import { GlassSurface } from '../components/glass/GlassSurface';
import { GlassTabs } from '../components/glass/GlassTabs';
import { useTheme } from '../theme/ThemeContext';
import { shade, withAlpha } from '../theme/color';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import {
  accountBalance,
  daysRemainingInMonth,
  groupByRelativeDate,
  monthKeyFor,
  periodInterval,
  summarize,
  totalBalance,
  transactionsInRange,
} from '../utils/finance';
import { budgetRows, budgetTotals, spendingPace, spendWindows } from '../utils/insights';
import { formatCompact, formatMoney } from '../utils/money';
import { PeriodKey, Transaction } from '../types';

const MARK = require('../../assets/splash-icon.png');

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

/**
 * The command centre.
 *
 * Read top to bottom it goes from the one number that matters to the detail
 * behind it: the balance on the nearest, brightest pane; then how spending is
 * going this month, laid out as tiles sized by importance rather than a row of
 * equal boxes; then the actions; then what just happened.
 */
export default function DashboardScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const {
    accounts,
    categories,
    transactions,
    budgets,
    activeAccountId,
    setActiveAccountId,
    balanceVisible,
    toggleBalanceVisible,
  } = useStore();

  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  const scoped = useMemo(
    () =>
      activeAccountId
        ? transactions.filter((t) => t.accountId === activeAccountId || t.toAccountId === activeAccountId)
        : transactions,
    [transactions, activeAccountId]
  );

  const balance = useMemo(() => {
    if (activeAccount) return accountBalance(activeAccount, transactions);
    return totalBalance(accounts, transactions);
  }, [activeAccount, accounts, transactions]);

  const { start, end } = periodInterval(period);
  const periodTxns = useMemo(() => transactionsInRange(scoped, start, end), [scoped, start, end]);
  const { income, expense, investment, net } = summarize(periodTxns);

  const recentSections = useMemo(() => groupByRelativeDate(scoped.slice(0, 60)), [scoped]);
  const categoryById = (id: string | null) => categories.find((c) => c.id === id);
  const accountById = (id: string) => accounts.find((a) => a.id === id);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.greetBlock}>
          <Text
            style={[styles.greeting, { color: theme.text }]}
            numberOfLines={1}
            // Shrinks a little rather than cutting the greeting off beside a
            // long name. The web has no shrink-to-fit and would pass it to the DOM.
            {...(Platform.OS !== 'web' ? { adjustsFontSizeToFit: true, minimumFontScale: 0.75 } : null)}
          >
            {greeting(user)}
          </Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>Track. Plan. Save. Live Better.</Text>
        </View>
        <View style={styles.headerActions}>
          <RoundGlassButton icon="search-outline" label="Search transactions" onPress={() => navigation.navigate('Transactions' as never)} />
          <ProfileChip />
        </View>
      </View>

      <Pressable style={styles.switcher} onPress={() => setSwitcherOpen(true)} accessibilityRole="button">
        <GlassSurface level="control" blur={false} borderRadius={radius.pill} contentStyle={styles.switcherInner}>
          <Ionicons name="wallet-outline" size={15} color={theme.textSecondary} />
          <Text style={[styles.switcherLabel, { color: theme.textSecondary }]}>
            {activeAccount ? activeAccount.name : 'All Accounts'}
          </Text>
          <Ionicons name="chevron-down" size={15} color={theme.textSecondary} />
        </GlassSurface>
      </Pressable>

      <SectionList
        sections={recentSections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 168, paddingHorizontal: spacing.md }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.xs }}>
            <BalanceHero
              balance={balance}
              visible={balanceVisible}
              onToggleVisible={toggleBalanceVisible}
              period={period}
              onPeriod={setPeriod}
              income={income}
              expense={expense}
              investment={investment}
              net={net}
            />

            <View style={styles.quickActions}>
              <QuickAction icon="arrow-up-circle" label="Add Expense" color={theme.expense} onPress={() => navigation.navigate('TransactionEntry', { initialType: 'expense' })} />
              <QuickAction icon="arrow-down-circle" label="Add Income" color={theme.success} onPress={() => navigation.navigate('TransactionEntry', { initialType: 'income' })} />
              <QuickAction icon="pie-chart" label="Budgets" color={theme.investment} onPress={() => navigation.navigate('Budgets' as never)} />
              <QuickAction icon="stats-chart" label="Analytics" color={theme.transfer} onPress={() => navigation.navigate('Analytics' as never)} />
            </View>

            <Text style={[styles.overline, { color: theme.textTertiary }]}>Spending</Text>
            <SpendingBento transactions={scoped} />

            <SmartTip transactions={scoped} categories={categories} />

            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Transactions</Text>
              <Pressable style={styles.seeAll} onPress={() => navigation.navigate('Transactions' as never)} hitSlop={8}>
                <Text style={[styles.seeAllText, { color: theme.tint }]}>See all</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.tint} />
              </Pressable>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.dateHeader, { color: theme.textTertiary }]}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const cat = categoryById(item.categoryId);
          const account = accountById(item.accountId);
          const toAccount = item.toAccountId ? accountById(item.toAccountId) : null;
          return (
            <GlassPressable
              level="row"
              borderRadius={radius.lg}
              style={styles.txnRowOuter}
              contentStyle={styles.txnRow}
              onPress={() => navigation.navigate('TransactionEntry', { transactionId: item.id })}
            >
              <IconBadge
                icon={(cat?.icon as any) ?? (item.type === 'transfer' ? 'swap-horizontal' : 'help-outline')}
                color={cat?.color ?? theme.transfer}
                size={42}
              />
              <View style={styles.txnMeta}>
                <Text style={[styles.txnTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.note || cat?.name || (item.type === 'transfer' ? 'Transfer' : 'Uncategorized')}
                </Text>
                <Text style={[styles.txnSub, { color: theme.textTertiary }]} numberOfLines={1}>
                  {format(new Date(item.date), 'd MMM, h:mm a')}
                  {toAccount ? ` · ${account?.name} → ${toAccount.name}` : account ? ` · ${account.name}` : ''}
                </Text>
              </View>
              <AmountText amount={item.amount} type={item.type} currency={item.currency} style={styles.txnAmount} />
            </GlassPressable>
          );
        }}
        ListEmptyComponent={<EmptyState icon="receipt-outline" title="No transactions yet" subtitle="Tap + to add your first transaction" />}
      />

      <QuickAddFab />

      <BottomSheetModal visible={switcherOpen} onClose={() => setSwitcherOpen(false)} title="Switch Account" maxHeightPct={70}>
        {[null, ...accounts].map((item) => (
          <Pressable
            key={item ? item.id : 'all'}
            onPress={() => {
              setActiveAccountId(item ? item.id : null);
              setSwitcherOpen(false);
            }}
            style={styles.accountRow}
            accessibilityRole="button"
          >
            <IconBadge icon={item ? (item.icon as any) : 'layers-outline'} color={item ? item.color : theme.tint} />
            <Text style={[styles.accountName, { color: theme.text }]}>{item ? item.name : 'All Accounts'}</Text>
            {(item ? item.id : null) === activeAccountId ? (
              <Ionicons name="checkmark-circle" size={20} color={theme.tint} />
            ) : null}
          </Pressable>
        ))}
      </BottomSheetModal>
    </Screen>
  );
}

/**
 * The nearest pane on the screen, carrying the one figure it leads with.
 *
 * The balance is large, bright and faintly luminous; everything else on the
 * pane is quieter so it cannot compete. The four period figures sit in a
 * grid divided by hairlines rather than four boxes of their own, so the pane
 * reads as one object with structure inside it.
 */
function BalanceHero({
  balance,
  visible,
  onToggleVisible,
  period,
  onPeriod,
  income,
  expense,
  investment,
  net,
}: {
  balance: number;
  visible: boolean;
  onToggleVisible: () => void;
  period: PeriodKey;
  onPeriod: (p: PeriodKey) => void;
  income: number;
  expense: number;
  investment: number;
  net: number;
}) {
  const { theme } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const dark = theme.mode === 'dark';

  return (
    <Card level="raised" style={styles.hero} padded={false}>
      {/* Light reflected into the pane from the room: teal at the far corner,
          the accent low at the near one. Barely there, but it is what makes
          this pane read as closer to the light than the rest. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={`${id}a`} cx="100%" cy="0%" rx="70%" ry="60%" fx="100%" fy="0%">
              <Stop offset="0" stopColor={theme.teal} stopOpacity={dark ? 0.2 : 0.12} />
              <Stop offset="1" stopColor={theme.teal} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`${id}b`} cx="0%" cy="100%" rx="70%" ry="55%" fx="0%" fy="100%">
              <Stop offset="0" stopColor={theme.tint} stopOpacity={dark ? 0.16 : 0.08} />
              <Stop offset="1" stopColor={theme.tint} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}a)`} />
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}b)`} />
        </Svg>
      </View>

      <View style={styles.heroInner}>
        <View style={styles.balanceRow}>
          <View style={styles.balanceLabelGroup}>
            <Text style={[styles.overlineTight, { color: theme.textSecondary }]}>Total Balance</Text>
            <Pressable
              onPress={onToggleVisible}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={visible ? 'Hide balance' : 'Show balance'}
            >
              <Ionicons name={visible ? 'eye-outline' : 'eye-off-outline'} size={17} color={theme.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.brandMark}>
            <Image source={MARK} style={styles.brandImage} resizeMode="contain" />
            <Text style={[styles.brandName, { color: theme.text }]}>Spendly</Text>
          </View>
        </View>

        <Figure
          value={balance}
          format={(n) => formatMoney(n)}
          hidden={!visible}
          fit
          style={[
            styles.balanceValue,
            {
              color: theme.text,
              textShadowColor: dark ? withAlpha(theme.tint, 0.45) : 'transparent',
            },
          ]}
        />

        <View style={styles.periodRow}>
          <GlassTabs options={PERIODS.map((p) => ({ key: p.key, label: p.label }))} value={period} onChange={onPeriod} />
        </View>

        <View style={[styles.grid, { borderColor: theme.borderSubtle }]}>
          <View style={styles.gridRow}>
            <SummaryFigure label="Income" value={income} color={theme.success} visible={visible} />
            <View style={[styles.vRule, { backgroundColor: theme.borderSubtle }]} />
            <SummaryFigure label="Expenses" value={expense} color={theme.expense} visible={visible} />
          </View>
          <View style={[styles.hRule, { backgroundColor: theme.borderSubtle }]} />
          <View style={styles.gridRow}>
            <SummaryFigure label="Invested" value={investment} color={theme.investment} visible={visible} />
            <View style={[styles.vRule, { backgroundColor: theme.borderSubtle }]} />
            <SummaryFigure label="Net" value={net} color={net >= 0 ? theme.success : theme.expense} visible={visible} />
          </View>
        </View>
      </View>
    </Card>
  );
}

/**
 * A figure in the hero's grid. The value is written in plain text ink and the
 * colour rides on the dot beside the label — a light hue as text is harder to
 * read than the same hue as a mark next to it.
 */
function SummaryFigure({ label, value, color, visible }: { label: string; value: number; color: string; visible: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={styles.summaryCell}>
      <View style={styles.summaryHead}>
        <View style={[styles.summaryDot, { backgroundColor: color, shadowColor: color }]} />
        <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{label}</Text>
      </View>
      <Figure
        value={value}
        format={(n) => formatMoney(n)}
        hidden={!visible}
        mask="••••"
        fit
        style={[styles.summaryValue, { color: theme.text }]}
      />
    </View>
  );
}

/**
 * Spending as tiles of different weights: the month as the dominant tile
 * with its pace drawn out, the budget beside the two short windows.
 */
function SpendingBento({ transactions }: { transactions: Transaction[] }) {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { categories, budgets } = useStore();

  const now = new Date();
  const pace = useMemo(() => spendingPace(transactions, now), [transactions]);
  const windows = useMemo(() => spendWindows(transactions, now), [transactions]);

  const monthKey = monthKeyFor(now);
  const budget = useMemo(() => {
    const { start, end } = periodInterval('month', now);
    return budgetTotals(budgetRows(categories, transactionsInRange(transactions, start, end), budgets, monthKey));
  }, [transactions, categories, budgets, monthKey]);

  const counts = useMemo(() => {
    const count = (p: 'day' | 'week') => {
      const { start, end } = periodInterval(p, now);
      return transactionsInRange(transactions, start, end).filter((t) => t.type === 'expense').length;
    };
    return { today: count('day'), week: count('week') };
  }, [transactions]);

  // Against the same day of last month, not all of last month: halfway
  // through September, the fair question is whether you are ahead of where
  // you were halfway through August.
  const day = now.getDate();
  const sameDayLast = pace.lastMonth[Math.min(day, pace.lastMonth.length) - 1] ?? 0;
  const delta = sameDayLast > 0 ? ((windows.month - sameDayLast) / sameDayLast) * 100 : null;
  const hasCompare = pace.lastMonth[pace.lastMonth.length - 1] > 0;

  return (
    <View style={styles.bento}>
      <GlassPressable
        level="panel"
        borderRadius={radius.xl}
        contentStyle={styles.paceTile}
        onPress={() => navigation.navigate('Analytics' as never)}
        accessibilityLabel={`Monthly spending ${formatMoney(windows.month)}. Opens analytics.`}
      >
        <View style={styles.tileHead}>
          <View>
            <Text style={[styles.tileLabel, { color: theme.textSecondary }]}>Monthly spending</Text>
            <Figure value={windows.month} format={(n) => formatMoney(n)} fit style={[styles.paceValue, { color: theme.text }]} />
          </View>
          {delta !== null && Math.abs(delta) >= 1 && (
            <View
              style={[
                styles.deltaChip,
                {
                  backgroundColor: delta <= 0 ? theme.successMuted : theme.expenseMuted,
                  borderColor: withAlpha(delta <= 0 ? theme.success : theme.expense, 0.35),
                },
              ]}
            >
              <Ionicons name={delta <= 0 ? 'arrow-down' : 'arrow-up'} size={12} color={delta <= 0 ? theme.success : theme.expense} />
              <Text style={[styles.deltaText, { color: delta <= 0 ? theme.success : theme.expense }]}>
                {Math.abs(delta).toFixed(0)}%
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.tileSub, { color: theme.textTertiary }]}>
          {delta !== null && Math.abs(delta) >= 1
            ? `${delta <= 0 ? 'Less' : 'More'} than this time last month`
            : `Spent in ${format(now, 'MMMM')}`}
        </Text>

        <View style={styles.paceChart}>
          <FlowChart
            values={pace.thisMonth}
            compare={hasCompare ? pace.lastMonth : undefined}
            slots={Math.max(pace.slots, pace.lastMonth.length)}
            height={96}
            labelFor={(i) => format(new Date(now.getFullYear(), now.getMonth(), i + 1), 'd MMM')}
            format={(n) => formatMoney(n)}
          />
        </View>

        {hasCompare && (
          <View style={styles.legend}>
            <LegendKey color={theme.tint} label="This month" />
            <LegendKey color={theme.textTertiary} label="Last month" faint />
          </View>
        )}
      </GlassPressable>

      <View style={styles.bentoRow}>
        <GlassPressable
          level="panel"
          borderRadius={radius.xl}
          style={styles.budgetTileOuter}
          contentStyle={styles.budgetTile}
          onPress={() => navigation.navigate('Budgets' as never)}
          accessibilityLabel="Remaining budget. Opens budgets."
        >
          <Text style={[styles.tileLabel, { color: theme.textSecondary }]}>Remaining budget</Text>
          {budget.count === 0 ? (
            <View style={styles.budgetEmpty}>
              <IconBadge icon="pie-chart-outline" color={theme.investment} size={36} />
              <Text style={[styles.tileSub, { color: theme.textSecondary }]}>No budget set yet</Text>
              <Text style={[styles.cta, { color: theme.tint }]}>Set one</Text>
            </View>
          ) : budget.remaining >= 0 ? (
            <>
              <Figure value={budget.remaining} format={(n) => formatCompact(n)} fit style={[styles.tileValue, { color: theme.text }]} />
              <Text style={[styles.tileSub, { color: theme.textTertiary }]}>of {formatCompact(budget.planned)}</Text>
              <View style={styles.budgetBar}>
                <ProgressBar progress={budget.planned > 0 ? budget.spent / budget.planned : 0} height={6} />
              </View>
              <Text style={[styles.tileFoot, { color: theme.textTertiary }]}>{daysRemainingInMonth(now)} days left</Text>
            </>
          ) : (
            <>
              <Figure value={budget.remaining} format={(n) => formatCompact(n)} fit style={[styles.tileValue, { color: theme.danger }]} />
              <View style={styles.overRow}>
                <Ionicons name="alert-circle" size={14} color={theme.danger} />
                <Text style={[styles.tileSub, { color: theme.danger }]}>Over budget</Text>
              </View>
              <Text style={[styles.tileFoot, { color: theme.textTertiary }]}>of {formatCompact(budget.planned)} planned</Text>
            </>
          )}
        </GlassPressable>

        <View style={styles.smallCol}>
          <WindowTile label="Today" value={windows.today} count={counts.today} />
          <WindowTile label="This week" value={windows.week} count={counts.week} />
        </View>
      </View>
    </View>
  );
}

function WindowTile({ label, value, count }: { label: string; value: number; count: number }) {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  return (
    <GlassPressable
      level="row"
      borderRadius={radius.lg}
      style={styles.smallTileOuter}
      contentStyle={styles.smallTile}
      onPress={() => navigation.navigate('Transactions' as never)}
      accessibilityLabel={`${label}: ${formatMoney(value)} across ${count} expenses`}
    >
      <Text style={[styles.tileLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Figure value={value} format={(n) => formatCompact(n)} fit style={[styles.smallValue, { color: theme.text }]} />
      <Text style={[styles.tileFoot, { color: theme.textTertiary }]}>
        {count === 0 ? 'Nothing spent' : `${count} ${count === 1 ? 'expense' : 'expenses'}`}
      </Text>
    </GlassPressable>
  );
}

function LegendKey({ color, label, faint }: { color: string; label: string; faint?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendLine, { backgroundColor: color, opacity: faint ? 0.6 : 1, height: faint ? 1.5 : 2 }]} />
      <Text style={[styles.legendLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <GlassPressable
      level="row"
      borderRadius={radius.lg}
      style={styles.quickAction}
      contentStyle={styles.quickActionInner}
      onPress={onPress}
      accessibilityLabel={label}
    >
      <IconBadge icon={icon} color={color} size={44} />
      <Text numberOfLines={2} style={[styles.quickActionLabel, { color: theme.text }]}>{label}</Text>
    </GlassPressable>
  );
}

function RoundGlassButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <GlassPressable
      feedback="press"
      level="control"
      blur={false}
      borderRadius={radius.pill}
      contentStyle={styles.roundBtn}
      onPress={onPress}
      accessibilityLabel={label}
      haptic={false}
    >
      <Ionicons name={icon} size={19} color={theme.text} />
    </GlassPressable>
  );
}

/**
 * One observation drawn from the person's own spending, or nothing at all.
 *
 * A tip that appears whatever the data says is decoration; this one only
 * shows when a category has genuinely moved by a margin worth a glance, and
 * it names the figure so the claim can be checked.
 */
function SmartTip({
  transactions,
  categories,
}: {
  transactions: Transaction[];
  categories: import('../types').Category[];
}) {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [dismissed, setDismissed] = useState(false);

  const tip = useMemo(() => {
    const now = new Date();
    const thisMonth = periodInterval('month', now);
    const lastMonth = periodInterval('month', new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const spendByCategory = (from: Date, to: Date) => {
      const map = new Map<string, number>();
      for (const t of transactionsInRange(transactions, from, to)) {
        if (t.type !== 'expense' || !t.categoryId) continue;
        map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
      }
      return map;
    };

    const current = spendByCategory(thisMonth.start, thisMonth.end);
    const previous = spendByCategory(lastMonth.start, lastMonth.end);

    let best: { name: string; pct: number } | null = null;
    for (const [categoryId, amount] of current) {
      const before = previous.get(categoryId) ?? 0;
      if (before <= 0) continue;
      const pct = ((amount - before) / before) * 100;
      if (Math.abs(pct) < 15) continue;
      if (!best || Math.abs(pct) > Math.abs(best.pct)) {
        best = { name: categories.find((c) => c.id === categoryId)?.name ?? 'a category', pct };
      }
    }
    return best;
  }, [transactions, categories]);

  if (!tip || dismissed) return null;

  const up = tip.pct > 0;
  return (
    <Card level="panel" style={styles.tipCard}>
      <View style={styles.tipRow}>
        <IconBadge icon={up ? 'bulb-outline' : 'checkmark-circle-outline'} color={up ? theme.warning : theme.success} size={40} />
        <View style={styles.tipBody}>
          <Text style={[styles.tipTitle, { color: theme.text }]}>Smart Tip</Text>
          <Text style={[styles.tipText, { color: theme.textSecondary }]}>
            You spent {Math.abs(tip.pct).toFixed(0)}% {up ? 'more' : 'less'} on {tip.name} this month than last.
          </Text>
        </View>
        <Pressable onPress={() => setDismissed(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss tip">
          <Ionicons name="close" size={18} color={theme.textTertiary} />
        </Pressable>
      </View>
      <Pressable style={styles.tipCta} onPress={() => navigation.navigate('Analytics' as never)} hitSlop={6}>
        <Text style={[styles.tipCtaText, { color: theme.tint }]}>View Insights</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.tint} />
      </Pressable>
    </Card>
  );
}

/** Time of day, and their first name if the account carries one. */
function greeting(user: { displayName: string | null; email: string | null } | null): string {
  const hour = new Date().getHours();
  const part = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = user?.displayName?.trim().split(/\s+/)[0];
  return name ? `${part}, ${name}` : part;
}

/**
 * Whoever is signed in, shown the way they would recognise themselves: their
 * own name and their own picture, rather than a generic silhouette.
 */
function ProfileChip() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  // A photo URL can 404 once Google rotates it; fall back rather than show a gap.
  const [photoBroken, setPhotoBroken] = useState(false);

  const given = greetingName(user);
  const photo = photoBroken ? null : user?.photoURL;

  return (
    <Pressable
      style={styles.profile}
      hitSlop={10}
      onPress={() => navigation.navigate(user ? 'Account' : 'Login')}
      accessibilityRole="button"
      accessibilityLabel={user ? 'Your account' : 'Sign in'}
    >
      {given && (
        <Text numberOfLines={1} style={[styles.profileName, { color: theme.text }]}>
          {given}
        </Text>
      )}
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={[styles.avatar, { borderColor: theme.glassEdge }]}
          onError={() => setPhotoBroken(true)}
        />
      ) : user ? (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.tintMuted, borderColor: theme.glassEdge }]}>
          <Text style={[styles.avatarInitial, { color: shade(theme.tint, theme.mode === 'dark' ? 0.4 : 0) }]}>{initial(user)}</Text>
        </View>
      ) : (
        <Ionicons name="person-circle-outline" size={32} color={theme.textSecondary} />
      )}
    </Pressable>
  );
}

/** Their name as they wrote it, or failing that the address they signed in with. */
function greetingName(user: { displayName: string | null; email: string | null } | null): string | null {
  return user?.displayName?.trim() || user?.email?.trim() || null;
}

function initial(user: { displayName: string | null; email: string | null }): string {
  const source = user.displayName?.trim() || user.email?.trim() || '';
  const letter = source.replace(/[^A-Za-z]/g, '').charAt(0);
  return letter ? letter.toUpperCase() : '#';
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  greetBlock: { flex: 1, paddingRight: spacing.sm },
  greeting: { fontSize: fontSizes.xl, fontWeight: '800', letterSpacing: -0.6 },
  tagline: { fontSize: fontSizes.xs, fontWeight: '500', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  roundBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: 170 },
  profileName: { fontSize: fontSizes.sm, fontWeight: '700', flexShrink: 1 },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: fontSizes.sm, fontWeight: '800' },

  switcher: { alignSelf: 'flex-start', marginHorizontal: spacing.md, marginBottom: spacing.sm },
  switcherInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  switcherLabel: { fontSize: fontSizes.sm, fontWeight: '700' },

  hero: { marginTop: spacing.xxs },
  heroInner: { padding: spacing.lg, paddingBottom: spacing.md },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  overlineTight: { fontSize: fontSizes.xs, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  brandMark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandImage: { width: 24, height: 24 },
  brandName: { fontSize: fontSizes.sm, fontWeight: '800', letterSpacing: -0.2 },
  // The one hero figure on the screen: large, and in proportional figures,
  // which set a big standalone number tighter than tabular ones would.
  balanceValue: {
    fontSize: fontSizes.display,
    fontWeight: '800',
    letterSpacing: -1.8,
    marginTop: spacing.xs,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  periodRow: { marginTop: spacing.md },
  grid: { marginTop: spacing.md },
  gridRow: { flexDirection: 'row', alignItems: 'stretch' },
  vRule: { width: StyleSheet.hairlineWidth },
  hRule: { height: StyleSheet.hairlineWidth },
  summaryCell: { flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  summaryLabel: { fontSize: fontSizes.xs, fontWeight: '600' },
  summaryValue: { fontSize: 19, fontWeight: '800', marginTop: 4, letterSpacing: -0.4 },

  quickActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  quickAction: { flex: 1 },
  quickActionInner: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md, paddingHorizontal: 4, minHeight: 100, justifyContent: 'center' },
  quickActionLabel: { fontSize: fontSizes.xs, fontWeight: '700', textAlign: 'center', lineHeight: 15 },

  overline: {
    fontSize: fontSizes.xs,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  bento: { gap: spacing.xs },
  paceTile: { padding: spacing.md, paddingBottom: spacing.sm },
  tileHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tileLabel: { fontSize: fontSizes.xs, fontWeight: '700' },
  paceValue: { fontSize: fontSizes.xxl, fontWeight: '800', letterSpacing: -0.9, marginTop: 2 },
  tileSub: { fontSize: fontSizes.xs, fontWeight: '600', marginTop: 2 },
  tileFoot: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  deltaText: { fontSize: fontSizes.xs, fontWeight: '800' },
  paceChart: { marginTop: spacing.sm, marginHorizontal: -4 },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 14, borderRadius: 1 },
  legendLabel: { fontSize: 11, fontWeight: '600' },

  bentoRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'stretch' },
  budgetTileOuter: { flex: 1.12 },
  budgetTile: { padding: spacing.md },
  budgetEmpty: { flex: 1, alignItems: 'flex-start', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xs },
  budgetBar: { marginTop: spacing.sm },
  overRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cta: { fontSize: fontSizes.sm, fontWeight: '800' },
  tileValue: { fontSize: fontSizes.xl, fontWeight: '800', letterSpacing: -0.7, marginTop: 4 },
  smallCol: { flex: 1, gap: spacing.xs },
  smallTileOuter: { flex: 1 },
  smallTile: { padding: spacing.sm, paddingHorizontal: spacing.md, justifyContent: 'center' },
  smallValue: { fontSize: fontSizes.lg, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },

  tipCard: { marginTop: spacing.md },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  tipBody: { flex: 1 },
  tipTitle: { fontSize: fontSizes.base, fontWeight: '800' },
  tipText: { fontSize: fontSizes.xs, lineHeight: 18, marginTop: 2 },
  tipCta: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-end', marginTop: spacing.xs },
  tipCtaText: { fontSize: fontSizes.sm, fontWeight: '700' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl },
  sectionTitle: { fontSize: fontSizes.md, fontWeight: '800', letterSpacing: -0.3 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: fontSizes.sm, fontWeight: '700' },
  dateHeader: { fontSize: fontSizes.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.xs },
  txnRowOuter: { marginBottom: spacing.xs },
  txnRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: spacing.sm },
  txnMeta: { flex: 1 },
  txnTitle: { fontSize: fontSizes.base, fontWeight: '700', letterSpacing: -0.2 },
  txnSub: { fontSize: fontSizes.xs, marginTop: 2 },
  txnAmount: { fontSize: fontSizes.base },

  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  accountName: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
});
