import React, { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { IconBadge } from '../components/IconBadge';
import { AmountText } from '../components/AmountText';
import { EmptyState } from '../components/EmptyState';
import { QuickAddFab } from '../components/QuickAddFab';
import { GlassPressable } from '../components/glass/GlassPressable';
import { GlassSurface } from '../components/glass/GlassSurface';
import { GlassTabs } from '../components/glass/GlassTabs';
import { GradientBadge } from '../components/glass/GradientBadge';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import {
  accountBalance,
  formatCurrency,
  groupByRelativeDate,
  periodInterval,
  summarize,
  totalBalance,
  transactionsInRange,
} from '../utils/finance';
import { PeriodKey } from '../types';

const MARK = require('../../assets/splash-icon.png');

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

export default function DashboardScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const {
    accounts,
    categories,
    transactions,
    activeAccountId,
    setActiveAccountId,
    balanceVisible,
    toggleBalanceVisible,
  } = useStore();

  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  const scopedTransactions = useMemo(
    () => (activeAccountId ? transactions.filter((t) => t.accountId === activeAccountId || t.toAccountId === activeAccountId) : transactions),
    [transactions, activeAccountId]
  );

  const balance = useMemo(() => {
    if (activeAccount) return accountBalance(activeAccount, transactions);
    return totalBalance(accounts, transactions);
  }, [activeAccount, accounts, transactions]);

  const { start, end } = periodInterval(period);
  const periodTxns = useMemo(() => transactionsInRange(scopedTransactions, start, end), [scopedTransactions, start, end]);
  const { income, expense, investment, net } = summarize(periodTxns);

  // Last month over this one, so the chip says something true rather than
  // decorative. Only spending is compared: it is the number people act on.
  const delta = useMemo(() => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const a = periodInterval('month', now);
    const b = periodInterval('month', prevMonth);
    const thisSpend = summarize(transactionsInRange(scopedTransactions, a.start, a.end)).expense;
    const lastSpend = summarize(transactionsInRange(scopedTransactions, b.start, b.end)).expense;
    if (lastSpend <= 0) return null;
    return ((thisSpend - lastSpend) / lastSpend) * 100;
  }, [scopedTransactions]);

  const recentSections = useMemo(() => groupByRelativeDate(scopedTransactions.slice(0, 60)), [scopedTransactions]);

  const categoryById = (id: string | null) => categories.find((c) => c.id === id);
  const accountById = (id: string) => accounts.find((a) => a.id === id);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.greetBlock}>
          <Text style={[styles.greeting, { color: theme.text }]} numberOfLines={1}>
            {greeting(user)}
          </Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>
            Track. Plan. Save. Live Better.
          </Text>
        </View>
        <View style={styles.headerActions}>
          <RoundGlassButton icon="search-outline" onPress={() => navigation.navigate('Transactions' as never)} />
          <ProfileChip />
        </View>
      </View>

      <Pressable style={styles.switcher} onPress={() => setSwitcherOpen(true)}>
        <GlassSurface level="row" blur={false} borderRadius={radius.pill} contentStyle={styles.switcherInner}>
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
        contentContainerStyle={{ paddingBottom: 168, paddingHorizontal: spacing.md }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Card level="raised" style={styles.balanceCard}>
              {/* The hero pane takes a breath of brand colour, strongest at
                  the lit corner, so it sits above the panes below it without
                  needing a heavier fill that would shut out the backdrop. */}
              <LinearGradient
                colors={[`${theme.tint}22`, `${theme.investment}14`, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.balanceRow}>
                {/* Label and its own control together on the left; the brand
                    takes the right corner, under the avatar in the header. */}
                <View style={styles.balanceLabelGroup}>
                  <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>Total Balance</Text>
                  <Pressable onPress={toggleBalanceVisible} hitSlop={10}>
                    <Ionicons name={balanceVisible ? 'eye-outline' : 'eye-off-outline'} size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>

                <View style={styles.brandMark}>
                  <Image source={MARK} style={styles.brandImage} resizeMode="contain" />
                  <Text style={[styles.brandName, { color: theme.text }]}>Spendly</Text>
                </View>
              </View>
              <Text style={[styles.balanceValue, { color: theme.text }]}>
                {balanceVisible ? formatCurrency(balance) : '••••••'}
              </Text>

              {delta !== null && (
                <View style={[styles.deltaChip, { backgroundColor: delta <= 0 ? theme.successMuted : theme.expenseMuted }]}>
                  <Ionicons
                    name={delta <= 0 ? 'arrow-down' : 'arrow-up'}
                    size={13}
                    color={delta <= 0 ? theme.success : theme.expense}
                  />
                  <Text style={[styles.deltaText, { color: delta <= 0 ? theme.success : theme.expense }]}>
                    {Math.abs(delta).toFixed(0)}%
                  </Text>
                  <Text style={[styles.deltaSub, { color: theme.textSecondary }]}>vs last month</Text>
                </View>
              )}

              <View style={styles.periodRow}>
                <GlassTabs options={PERIODS.map((p) => ({ key: p.key, label: p.label }))} value={period} onChange={setPeriod} />
              </View>

              <View style={styles.summaryRow}>
                <SummaryChip label="Income" value={income} color={theme.success} visible={balanceVisible} />
                <SummaryChip label="Expenses" value={expense} color={theme.expense} visible={balanceVisible} />
                <SummaryChip label="Invested" value={investment} color={theme.investment} visible={balanceVisible} />
                <SummaryChip
                  label="Net"
                  value={net}
                  color={net >= 0 ? theme.success : theme.expense}
                  visible={balanceVisible}
                />
              </View>
            </Card>

            <View style={styles.quickActions}>
              <QuickAction icon="arrow-up-circle" label="Add Expense" color={theme.expense} onPress={() => navigation.navigate('TransactionEntry', { initialType: 'expense' })} />
              <QuickAction icon="arrow-down-circle" label="Add Income" color={theme.success} onPress={() => navigation.navigate('TransactionEntry', { initialType: 'income' })} />
              <QuickAction icon="pie-chart" label="Budgets" color={theme.investment} onPress={() => navigation.navigate('Budgets' as never)} />
              <QuickAction icon="stats-chart" label="Analytics" color={theme.transfer} onPress={() => navigation.navigate('Analytics' as never)} />
            </View>

            <SmartTip transactions={scopedTransactions} categories={categories} />

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
              blur={false}
              borderRadius={radius.lg}
              style={styles.txnRowOuter}
              contentStyle={styles.txnRow}
              onPress={() => navigation.navigate('TransactionEntry', { transactionId: item.id })}
            >
              <IconBadge icon={(cat?.icon as any) ?? (item.type === 'transfer' ? 'swap-horizontal' : 'help-outline')} color={cat?.color ?? theme.transfer} />
              <View style={styles.txnMeta}>
                <Text style={[styles.txnTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.note || cat?.name || (item.type === 'transfer' ? 'Transfer' : 'Uncategorized')}
                </Text>
                <Text style={[styles.txnSub, { color: theme.textTertiary }]} numberOfLines={1}>
                  {format(new Date(item.date), 'd MMM, h:mm a')}
                  {toAccount ? ` · ${account?.name} → ${toAccount.name}` : account ? ` · ${account.name}` : ''}
                </Text>
              </View>
              <AmountText amount={item.amount} type={item.type} currency={item.currency} />
              <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} />
            </GlassPressable>
          );
        }}
        ListEmptyComponent={<EmptyState icon="receipt-outline" title="No transactions yet" subtitle="Tap + to add your first transaction" />}
      />

      <QuickAddFab />

      <Modal visible={switcherOpen} animationType="slide" transparent onRequestClose={() => setSwitcherOpen(false)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: theme.overlay }]} onPress={() => setSwitcherOpen(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Switch Account</Text>
            <FlatList
              data={[null, ...accounts]}
              keyExtractor={(item) => (item ? item.id : 'all')}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setActiveAccountId(item ? item.id : null);
                    setSwitcherOpen(false);
                  }}
                  style={styles.accountRow}
                >
                  <IconBadge icon={item ? (item.icon as any) : 'layers-outline'} color={item ? item.color : theme.tint} />
                  <Text style={[styles.accountName, { color: theme.text }]}>{item ? item.name : 'All Accounts'}</Text>
                  {(item ? item.id : null) === activeAccountId ? (
                    <Ionicons name="checkmark-circle" size={20} color={theme.tint} />
                  ) : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/**
 * Each figure on its own pane rather than a flat colour swatch.
 *
 * A muted fill is opaque, so the scene behind it stops dead at the chip's
 * edge and the panel it sits on stops looking like glass. These are panes in
 * their own right: the backdrop carries through, and the colour arrives as a
 * wash falling across the surface rather than a block of paint, with a dot of
 * the full colour to name it.
 */
function SummaryChip({ label, value, color, visible }: { label: string; value: number; color: string; visible: boolean }) {
  const { theme } = useTheme();
  return (
    <GlassSurface
      level="row"
      blur={false}
      borderRadius={radius.lg}
      style={styles.summaryChip}
      contentStyle={styles.summaryInner}
    >
      <LinearGradient
        colors={[`${color}2E`, `${color}0A`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.summaryHead}>
        <View style={[styles.summaryDot, { backgroundColor: color, shadowColor: color }]} />
        <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[styles.summaryValue, { color }]}>{visible ? formatCurrency(value) : '••••'}</Text>
    </GlassSurface>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <GlassPressable
      level="row"
      blur={false}
      borderRadius={radius.lg}
      style={styles.quickAction}
      contentStyle={styles.quickActionInner}
      onPress={onPress}
    >
      <GradientBadge icon={icon} color={color} size={48} />
      <Text numberOfLines={2} style={[styles.quickActionLabel, { color: theme.text }]}>{label}</Text>
    </GlassPressable>
  );
}

function RoundGlassButton({
  icon,
  onPress,
  dot,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  dot?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <GlassSurface level="raised" borderRadius={radius.pill} contentStyle={styles.roundBtn}>
        <Ionicons name={icon} size={20} color={theme.text} />
      </GlassSurface>
      {dot && <View style={[styles.dot, { backgroundColor: theme.expense, borderColor: theme.bg }]} />}
    </Pressable>
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
  transactions: import('../types').Transaction[];
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
    <Card level="raised" style={styles.tipCard}>
      <View style={styles.tipRow}>
        <GradientBadge icon={up ? 'bulb' : 'checkmark-circle'} color={up ? theme.warning : theme.success} size={42} />
        <View style={styles.tipBody}>
          <Text style={[styles.tipTitle, { color: theme.text }]}>Smart Tip</Text>
          <Text style={[styles.tipText, { color: theme.textSecondary }]}>
            You spent {Math.abs(tip.pct).toFixed(0)}% {up ? 'more' : 'less'} on {tip.name} this month than last.
          </Text>
        </View>
        <Pressable onPress={() => setDismissed(true)} hitSlop={10}>
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

/** Their name if the account carries one, so the app greets a person. */
function greeting(user: { displayName: string | null; email: string | null } | null): string {
  const name = user?.displayName?.trim().split(/\s+/)[0];
  return name ? `Hi ${name} 👋` : 'Hi there 👋';
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
    >
      {given && (
        <Text numberOfLines={1} style={[styles.profileName, { color: theme.text }]}>
          {given}
        </Text>
      )}
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={[styles.avatar, { borderColor: theme.border }]}
          onError={() => setPhotoBroken(true)}
        />
      ) : user ? (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.tintMuted, borderColor: theme.border }]}>
          <Text style={[styles.avatarInitial, { color: theme.tint }]}>{initial(user)}</Text>
        </View>
      ) : (
        <Ionicons name="person-circle-outline" size={30} color={theme.textSecondary} />
      )}
    </Pressable>
  );
}

/** Their name as they wrote it, or failing that the address they signed in with. */
function greetingName(user: { displayName: string | null; email: string | null } | null): string | null {
  return user?.displayName?.trim() || user?.email?.trim() || null;
}

function initial(user: { displayName: string | null; email: string | null; phoneNumber: string | null }): string {
  const source = user.displayName?.trim() || user.email?.trim() || '';
  const letter = source.replace(/[^A-Za-z]/g, '').charAt(0);
  return letter ? letter.toUpperCase() : '#';
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '62%' },
  profileName: { fontSize: fontSizes.sm, fontWeight: '700', flexShrink: 1 },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: fontSizes.sm, fontWeight: '800' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roundBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 2, right: 2, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  balanceLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  brandMark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandImage: { width: 26, height: 26 },
  brandName: { fontSize: fontSizes.sm, fontWeight: '800', letterSpacing: -0.2 },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  deltaText: { fontSize: fontSizes.sm, fontWeight: '800' },
  deltaSub: { fontSize: fontSizes.xs, fontWeight: '600' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: fontSizes.sm, fontWeight: '700' },
  tipCard: { marginTop: spacing.lg },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  tipBody: { flex: 1 },
  tipTitle: { fontSize: fontSizes.base, fontWeight: '800' },
  tipText: { fontSize: fontSizes.xs, lineHeight: 18, marginTop: 2 },
  tipCta: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-end', marginTop: spacing.xs },
  tipCtaText: { fontSize: fontSizes.sm, fontWeight: '700' },
  greetBlock: { flex: 1, paddingRight: spacing.sm },
  greeting: { fontSize: fontSizes.lg, fontWeight: '800', letterSpacing: -0.3 },
  tagline: { fontSize: fontSizes.xs, fontWeight: '500', marginTop: 2 },
  switcher: { alignSelf: 'flex-start', marginHorizontal: spacing.md, marginBottom: spacing.xs },
  switcherInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  switcherLabel: { fontSize: fontSizes.sm, fontWeight: '700' },
  balanceCard: { marginTop: spacing.xs, paddingBottom: spacing.xs },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel: { fontSize: fontSizes.sm, fontWeight: '600' },
  balanceValue: { fontSize: fontSizes.xxxl, fontWeight: '800', marginTop: spacing.xxs, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  periodRow: { marginTop: spacing.md },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  summaryChip: { flexGrow: 1, flexBasis: '46%' },
  summaryInner: { padding: spacing.sm },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOpacity: 0.7,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  summaryLabel: { fontSize: fontSizes.xs, fontWeight: '600' },
  summaryValue: { fontSize: fontSizes.base, fontWeight: '800', marginTop: 4, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  quickActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg },
  quickAction: { flex: 1 },
  quickActionInner: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md, paddingHorizontal: 4, minHeight: 116, justifyContent: 'center' },
  quickIconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  quickActionLabel: { fontSize: fontSizes.xs, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
  sectionTitle: { fontSize: fontSizes.md, fontWeight: '800' },
  dateHeader: { fontSize: fontSizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm, marginBottom: spacing.xs },
  txnRowOuter: { marginBottom: spacing.xs },
  txnRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: spacing.sm },
  txnMeta: { flex: 1 },
  txnTitle: { fontSize: fontSizes.base, fontWeight: '600' },
  txnSub: { fontSize: fontSizes.xs, marginTop: 2 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '70%' },
  modalTitle: { fontSize: fontSizes.lg, fontWeight: '700', marginBottom: spacing.md },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  accountName: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
});
