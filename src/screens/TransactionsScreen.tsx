import { useShallow } from 'zustand/react/shallow';
import React, { useDeferredValue, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../theme/type';
import Ionicons from '@expo/vector-icons/Ionicons';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns/format';
import { parseISO } from 'date-fns/parseISO';
import { Screen } from '../components/Screen';
import { Pill } from '../components/Pill';
import { CategoryIcon } from '../components/CategoryIcon';
import { AmountText } from '../components/AmountText';
import { EmptyState } from '../components/EmptyState';
import { QuickAddFab } from '../components/QuickAddFab';
import { GlassPressable } from '../components/glass/GlassPressable';
import { GlassSurface } from '../components/glass/GlassSurface';
import { BottomSheetModal } from '../components/BottomSheetModal';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { periodInterval, transactionsInRange } from '../utils/finance';
import { Transaction, TransactionType } from '../types';

type IntervalTab = 'all' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'category_az';

const TABS: { key: IntervalTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date_desc', label: 'Date: Newest' },
  { key: 'date_asc', label: 'Date: Oldest' },
  { key: 'amount_desc', label: 'Amount: High to Low' },
  { key: 'amount_asc', label: 'Amount: Low to High' },
  { key: 'category_az', label: 'Category: A-Z' },
];

/** Keep the swipe colors hidden behind rounded corners until the row moves. */
function SwipeAction({ progress, color, icon, label, onPress }: {
  progress: SharedValue<number>;
  color: string;
  icon: 'trash-outline' | 'pencil-outline';
  label: string;
  onPress: () => void;
}) {
  const reveal = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (progress.value - 0.03) / 0.15)),
  }));
  return (
    <Animated.View style={[styles.swipeActionContainer, reveal]}>
      <Pressable style={[styles.swipeAction, { backgroundColor: color }]} onPress={onPress}
        accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name={icon} size={22} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

export default function TransactionsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { transactions, categories, accounts, activeAccountId, removeTransaction, updateTransaction } = useStore(useShallow((s) => ({ transactions: s.transactions, categories: s.categories, accounts: s.accounts, activeAccountId: s.activeAccountId, removeTransaction: s.removeTransaction, updateTransaction: s.updateTransaction })));

  const [tab, setTab] = useState<IntervalTab>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const searchPending = search !== deferredSearch;
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  // Lights the search field's border while it holds focus.
  const [searchFocused, setSearchFocused] = useState(false);
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [typeFilters, setTypeFilters] = useState<TransactionType[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [accountFilters, setAccountFilters] = useState<string[]>([]);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategorySheetOpen, setBulkCategorySheetOpen] = useState(false);

  const scoped = useMemo(
    () => (activeAccountId ? transactions.filter((t) => t.accountId === activeAccountId || t.toAccountId === activeAccountId) : transactions),
    [transactions, activeAccountId]
  );

  const intervalFiltered = useMemo(() => {
    if (tab === 'all') return scoped;
    const key = tab === 'daily' ? 'day' : tab === 'weekly' ? 'week' : tab === 'monthly' ? 'month' : 'year';
    const { start, end } = periodInterval(key as any);
    return transactionsInRange(scoped, start, end);
  }, [scoped, tab]);

  const filtered = useMemo(() => {
    let result = intervalFiltered;
    if (typeFilters.length) result = result.filter((t) => typeFilters.includes(t.type));
    if (categoryFilters.length) result = result.filter((t) => t.categoryId && categoryFilters.includes(t.categoryId));
    if (accountFilters.length) result = result.filter((t) => accountFilters.includes(t.accountId) || (t.toAccountId && accountFilters.includes(t.toAccountId)));
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      result = result.filter((t) => t.note.toLowerCase().includes(q) || categoryById.get(t.categoryId ?? '')?.name.toLowerCase().includes(q));
    }
    return result;
  }, [intervalFiltered, typeFilters, categoryFilters, accountFilters, deferredSearch, categoryById]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case 'date_asc':
        return arr.sort((a, b) => (a.date > b.date ? 1 : -1));
      case 'amount_desc':
        return arr.sort((a, b) => b.amount - a.amount);
      case 'amount_asc':
        return arr.sort((a, b) => a.amount - b.amount);
      case 'category_az':
        return arr.sort((a, b) => {
          const an = categoryById.get(a.categoryId ?? '')?.name ?? 'zzz';
          const bn = categoryById.get(b.categoryId ?? '')?.name ?? 'zzz';
          return an.localeCompare(bn);
        });
      case 'date_desc':
      default:
        return arr.sort((a, b) => (a.date < b.date ? 1 : -1));
    }
  }, [filtered, sort, categoryById]);

  const activeFilterCount = typeFilters.length + categoryFilters.length + accountFilters.length;

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleBulkDelete = () => {
    Alert.alert(`Delete ${selectedIds.length} transactions?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          for (const id of selectedIds) await removeTransaction(id);
          setSelectedIds([]);
          setSelectionMode(false);
        },
      },
    ]);
  };

  const applyBulkCategory = async (categoryId: string) => {
    for (const id of selectedIds) await updateTransaction(id, { categoryId });
    setSelectedIds([]);
    setSelectionMode(false);
    setBulkCategorySheetOpen(false);
  };

  const renderRightActions = (item: Transaction, progress: SharedValue<number>) => (
    <SwipeAction progress={progress} color={theme.danger} icon="trash-outline" label="Delete transaction"
      onPress={() =>
        Alert.alert('Delete transaction?', undefined, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => removeTransaction(item.id) },
        ])
      }
    />
  );

  const renderLeftActions = (item: Transaction, progress: SharedValue<number>) => (
    <SwipeAction progress={progress} color={theme.tint} icon="pencil-outline" label="Edit transaction"
      onPress={() => navigation.navigate('TransactionEntry', { transactionId: item.id })}
    />
  );

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Transactions</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => setSortOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Sort transactions">
              <GlassSurface level="control" blur={false} borderRadius={radius.pill} contentStyle={styles.roundBtn}>
                <Ionicons name="swap-vertical-outline" size={19} color={theme.text} />
              </GlassSurface>
            </Pressable>
            <Pressable onPress={() => setFilterOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Filter transactions, ${activeFilterCount} active filters`} style={{ marginLeft: spacing.xs }}>
              <GlassSurface level="control" blur={false} borderRadius={radius.pill} contentStyle={styles.roundBtn}>
                <Ionicons name="options-outline" size={19} color={theme.text} />
              </GlassSurface>
              {activeFilterCount > 0 && (
                <View style={[styles.filterBadge, { backgroundColor: theme.tint, borderColor: theme.bg }]}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        <View style={[styles.searchBox, { backgroundColor: theme.surfaceAlt, borderColor: searchFocused ? theme.tint : theme.glassBorder }]}>
          <Ionicons name="search" size={16} color={theme.textTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            accessibilityLabel="Search transactions"
            placeholder="Search transactions..."
            placeholderTextColor={theme.textTertiary}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={[styles.searchInput, { color: theme.text }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsRow}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xxs, alignItems: 'center' }}
        >
          {TABS.map((t) => (
            <Pill key={t.key} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />
          ))}
        </ScrollView>

        <FlatList
          data={sorted}
          accessibilityState={{ busy: searchPending }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          keyExtractor={(item) => item.id}
          // Enough rows to fill the screen at once, then the rest in small
          // batches, so the first frame is quick and scrolling never waits.
          initialNumToRender={9}
          maxToRenderPerBatch={8}
          windowSize={9}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 168 }}
          ListEmptyComponent={<EmptyState icon="filter-outline" title={searchPending ? "Updating results…" : "No matching transactions"} subtitle="Try another search or adjust your filters" />}
          renderItem={({ item }) => {
            const cat = categoryById.get(item.categoryId ?? '');
            const account = accountById.get(item.accountId);
            const toAccount = item.toAccountId ? accountById.get(item.toAccountId) : null;
            const row = (
              <GlassPressable
                feedback="press"
                level="row"
                blur={false}
                // The delete and edit panels live behind this row; translucent
                // glass would leave them showing through at rest.
                opaque
                borderRadius={radius.lg}
                style={styles.txnRowOuter}
                contentStyle={styles.txnRow}
                onPress={() => (selectionMode ? toggleSelected(item.id) : navigation.navigate('TransactionEntry', { transactionId: item.id }))}
                onLongPress={() => {
                  setSelectionMode(true);
                  toggleSelected(item.id);
                }}
              >
                {selectionMode && (
                  <Ionicons
                    name={selectedIds.includes(item.id) ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={selectedIds.includes(item.id) ? theme.tint : theme.textTertiary}
                  />
                )}
                <CategoryIcon icon={(cat?.icon as any) ?? 'swap-horizontal-outline'} />
                <View style={styles.txnMeta}>
                  <Text style={[styles.txnTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.note || cat?.name || 'Transfer'}
                  </Text>
                  <Text style={[styles.txnSub, { color: theme.textTertiary }]}>
                    {toAccount ? `${account?.name} → ${toAccount.name}` : account?.name} ·{' '}
                    {format(parseISO(item.date), 'MMM d, h:mm a')}
                  </Text>
                </View>
                <AmountText amount={item.amount} type={item.type} currency={item.currency} />
              </GlassPressable>
            );
            if (selectionMode) return row;
            return (
              <Swipeable renderRightActions={(progress) => renderRightActions(item, progress)} renderLeftActions={(progress) => renderLeftActions(item, progress)}>
                {row}
              </Swipeable>
            );
          }}
        />

        {selectionMode ? (
          <View style={[styles.bulkBar, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontWeight: '600' }}>{selectedIds.length} selected</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Pressable onPress={() => setBulkCategorySheetOpen(true)}>
                <Ionicons name="pricetag-outline" size={22} color={theme.tint} />
              </Pressable>
              <Pressable onPress={handleBulkDelete}>
                <Ionicons name="trash-outline" size={22} color={theme.danger} />
              </Pressable>
              <Pressable
                onPress={() => {
                  setSelectionMode(false);
                  setSelectedIds([]);
                }}
              >
                <Ionicons name="close-circle-outline" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
          </View>
        ) : (
          <QuickAddFab />
        )}

        <BottomSheetModal visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort By" maxHeightPct={55}>
          {SORT_OPTIONS.map((s) => (
            <Pressable key={s.key} style={styles.optionRow} onPress={() => { setSort(s.key); setSortOpen(false); }}>
              <Text style={{ color: theme.text, fontSize: fontSizes.base, fontWeight: '600' }}>{s.label}</Text>
              {sort === s.key ? <Ionicons name="checkmark-circle" size={20} color={theme.tint} /> : null}
            </Pressable>
          ))}
        </BottomSheetModal>

        <BottomSheetModal visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filters">
          <Text style={[styles.filterGroupLabel, { color: theme.textSecondary }]}>Type</Text>
          <View style={styles.chipsWrap}>
            {(['expense', 'income', 'investment', 'transfer'] as TransactionType[]).map((t) => (
              <Pill
                key={t}
                label={t.charAt(0).toUpperCase() + t.slice(1)}
                active={typeFilters.includes(t)}
                onPress={() => setTypeFilters((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
              />
            ))}
          </View>

          <Text style={[styles.filterGroupLabel, { color: theme.textSecondary }]}>Category</Text>
          <View style={styles.chipsWrap}>
            {categories.filter((c) => !c.archived).map((c) => (
              <Pill
                key={c.id}
                label={c.name}
                color={c.color}
                active={categoryFilters.includes(c.id)}
                onPress={() => setCategoryFilters((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
              />
            ))}
          </View>

          <Text style={[styles.filterGroupLabel, { color: theme.textSecondary }]}>Account</Text>
          <View style={styles.chipsWrap}>
            {accounts.map((a) => (
              <Pill
                key={a.id}
                label={a.name}
                color={a.color}
                active={accountFilters.includes(a.id)}
                onPress={() => setAccountFilters((prev) => (prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
              />
            ))}
          </View>

          <Pressable
            style={[styles.clearFiltersBtn, { borderColor: theme.border }]}
            onPress={() => {
              setTypeFilters([]);
              setCategoryFilters([]);
              setAccountFilters([]);
            }}
          >
            <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>Clear all filters</Text>
          </Pressable>
        </BottomSheetModal>

        <BottomSheetModal visible={bulkCategorySheetOpen} onClose={() => setBulkCategorySheetOpen(false)} title="Set Category">
          {categories.filter((c) => !c.archived).map((c) => (
            <Pressable key={c.id} style={styles.optionRow} onPress={() => applyBulkCategory(c.id)}>
              <CategoryIcon icon={c.icon as any} size={32} />
              <Text style={{ color: theme.text, fontSize: fontSizes.base, fontWeight: '600', marginLeft: spacing.sm, flex: 1 }}>{c.name}</Text>
            </Pressable>
          ))}
        </BottomSheetModal>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  title: { fontSize: 26, fontWeight: '300' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  roundBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  filterBadge: { position: 'absolute', top: -2, right: -4, minWidth: 17, height: 17, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginHorizontal: spacing.md, marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: fontSizes.sm, padding: 0 },
  tabsRow: { marginTop: spacing.sm, flexGrow: 0, flexShrink: 0 },
  txnRowOuter: { marginTop: spacing.xs },
  txnRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: spacing.sm },
  txnMeta: { flex: 1 },
  txnTitle: { fontSize: fontSizes.base, fontWeight: '600' },
  txnSub: { fontSize: fontSizes.xs, marginTop: 2 },
  swipeActionContainer: { width: 72, marginTop: spacing.xs },
  swipeAction: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  bulkBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  filterGroupLabel: { fontSize: fontSizes.sm, fontWeight: '700', marginTop: spacing.sm, marginBottom: spacing.xs },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  clearFiltersBtn: { marginTop: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
});
