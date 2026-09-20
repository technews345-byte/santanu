import React, { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { IconBadge } from '../components/IconBadge';
import { AmountText } from '../components/AmountText';
import { EmptyState } from '../components/EmptyState';
import { QuickAddFab } from '../components/QuickAddFab';
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

  const recentSections = useMemo(() => groupByRelativeDate(scopedTransactions.slice(0, 60)), [scopedTransactions]);

  const categoryById = (id: string | null) => categories.find((c) => c.id === id);
  const accountById = (id: string) => accounts.find((a) => a.id === id);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable style={styles.switcher} onPress={() => setSwitcherOpen(true)}>
          <Text style={[styles.switcherLabel, { color: theme.textSecondary }]}>
            {activeAccount ? activeAccount.name : 'All Accounts'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
        </Pressable>
        <ProfileChip />
      </View>

      <SectionList
        sections={recentSections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: spacing.md }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Card style={styles.balanceCard}>
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>Total Balance</Text>
                <Pressable onPress={toggleBalanceVisible} hitSlop={10}>
                  <Ionicons name={balanceVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color={theme.textSecondary} />
                </Pressable>
              </View>
              <Text style={[styles.balanceValue, { color: theme.text }]}>
                {balanceVisible ? formatCurrency(balance) : '••••••'}
              </Text>

              <View style={styles.periodRow}>
                {PERIODS.map((p) => (
                  <Pill key={p.key} label={p.label} active={period === p.key} onPress={() => setPeriod(p.key)} />
                ))}
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
              <QuickAction icon="add-circle" label="Income" color={theme.success} onPress={() => navigation.navigate('TransactionEntry', { initialType: 'income' })} />
              <QuickAction icon="remove-circle" label="Expense" color={theme.expense} onPress={() => navigation.navigate('TransactionEntry', { initialType: 'expense' })} />
              <QuickAction icon="trending-up" label="Invest" color={theme.investment} onPress={() => navigation.navigate('TransactionEntry', { initialType: 'investment' })} />
              <QuickAction icon="swap-horizontal" label="Transfer" color={theme.transfer} onPress={() => navigation.navigate('TransactionEntry', { initialType: 'transfer' })} />
              <QuickAction icon="download-outline" label="Export" color={theme.tint} onPress={() => navigation.navigate('Settings' as never, { screen: 'Export' } as never)} />
            </View>

            <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Activity</Text>
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
            <Pressable
              onPress={() => navigation.navigate('TransactionEntry', { transactionId: item.id })}
              style={({ pressed }) => [styles.txnRow, { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <IconBadge icon={(cat?.icon as any) ?? (item.type === 'transfer' ? 'swap-horizontal' : 'help-outline')} color={cat?.color ?? theme.transfer} />
              <View style={styles.txnMeta}>
                <Text style={[styles.txnTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.note || cat?.name || (item.type === 'transfer' ? 'Transfer' : 'Uncategorized')}
                </Text>
                <Text style={[styles.txnSub, { color: theme.textTertiary }]} numberOfLines={1}>
                  {toAccount ? `${account?.name} → ${toAccount.name}` : account?.name ?? 'Account'}
                </Text>
              </View>
              <AmountText amount={item.amount} type={item.type} currency={item.currency} />
            </Pressable>
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

function SummaryChip({ label, value, color, visible }: { label: string; value: number; color: string; visible: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.summaryChip, { backgroundColor: `${color}18` }]}>
      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{visible ? formatCurrency(value) : '••••'}</Text>
    </View>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <View style={[styles.quickIconWrap, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.quickActionLabel, { color: theme.textSecondary }]}>{label}</Text>
    </Pressable>
  );
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

  const given = firstName(user?.displayName);
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

/** Just the given name: a header has room for one word, not a full name. */
function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

function initial(user: { displayName: string | null; email: string | null; phoneNumber: string | null }): string {
  const source = user.displayName?.trim() || user.email?.trim() || '';
  const letter = source.replace(/[^A-Za-z]/g, '').charAt(0);
  return letter ? letter.toUpperCase() : '#';
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '55%' },
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
  switcher: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  switcherLabel: { fontSize: fontSizes.md, fontWeight: '700' },
  balanceCard: { marginTop: spacing.xs },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel: { fontSize: fontSizes.sm, fontWeight: '600' },
  balanceValue: { fontSize: fontSizes.xxxl, fontWeight: '800', marginTop: spacing.xxs, fontVariant: ['tabular-nums'] },
  periodRow: { flexDirection: 'row', marginTop: spacing.md },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  summaryChip: { flexGrow: 1, flexBasis: '46%', borderRadius: radius.md, padding: spacing.sm },
  summaryLabel: { fontSize: fontSizes.xs, fontWeight: '600' },
  summaryValue: { fontSize: fontSizes.sm, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  quickAction: { alignItems: 'center', gap: 6, flex: 1 },
  quickIconWrap: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { fontSize: fontSizes.xs, fontWeight: '600' },
  sectionTitle: { fontSize: fontSizes.md, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.xs },
  dateHeader: { fontSize: fontSizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm, marginBottom: spacing.xs },
  txnRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.xs, gap: spacing.sm },
  txnMeta: { flex: 1 },
  txnTitle: { fontSize: fontSizes.base, fontWeight: '600' },
  txnSub: { fontSize: fontSizes.xs, marginTop: 2 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '70%' },
  modalTitle: { fontSize: fontSizes.lg, fontWeight: '700', marginBottom: spacing.md },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  accountName: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
});
