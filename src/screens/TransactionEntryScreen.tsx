import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Screen } from '../components/Screen';
import { IconBadge } from '../components/IconBadge';
import { Keypad } from '../components/Keypad';
import { BottomSheetModal } from '../components/BottomSheetModal';
import { Pill } from '../components/Pill';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { evaluateExpression, formatExpressionDisplay } from '../utils/calculator';
import { DEFAULT_CURRENCY } from '../utils/finance';
import { RecurrenceInterval, TransactionType } from '../types';
import { format } from 'date-fns';

const TYPE_CONFIG: Record<TransactionType, { label: string; color: (theme: any) => string }> = {
  expense: { label: 'Expense', color: (t) => t.expense },
  income: { label: 'Income', color: (t) => t.success },
  transfer: { label: 'Transfer', color: (t) => t.transfer },
};

const RECURRENCE_OPTIONS: { key: RecurrenceInterval; label: string }[] = [
  { key: 'none', label: 'Never' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

export default function TransactionEntryScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { transactionId, initialType } = route.params ?? {};

  const { accounts, categories, transactions, addTransaction, updateTransaction, removeTransaction, activeAccountId } = useStore();
  const existing = transactionId ? transactions.find((t) => t.id === transactionId) : undefined;

  const [type, setType] = useState<TransactionType>(existing?.type ?? initialType ?? 'expense');
  const [expression, setExpression] = useState<string>(existing ? String(existing.amount) : '0');
  const [accountId, setAccountId] = useState<string>(existing?.accountId ?? activeAccountId ?? accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState<string | null>(existing?.toAccountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [date, setDate] = useState<Date>(existing ? new Date(existing.date) : new Date());
  const [attachments, setAttachments] = useState<string[]>(existing?.attachments ?? []);
  const [recurrence, setRecurrence] = useState<RecurrenceInterval>(existing?.recurrence ?? 'none');

  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [toAccountSheetOpen, setToAccountSheetOpen] = useState(false);
  const [recurrenceSheetOpen, setRecurrenceSheetOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (!categoryId) {
      const firstOfType = categories.find((c) => c.type === (type === 'income' ? 'income' : 'expense') && !c.archived);
      if (firstOfType && type !== 'transfer') setCategoryId(firstOfType.id);
    }
  }, [type]);

  const relevantCategories = useMemo(
    () => categories.filter((c) => !c.archived && c.type === (type === 'income' ? 'income' : 'expense')),
    [categories, type]
  );

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedToAccount = accounts.find((a) => a.id === toAccountId);

  const amount = evaluateExpression(expression);
  const typeColor = TYPE_CONFIG[type].color(theme);

  const onKeyPress = (key: string) => {
    if (key === 'backspace') {
      setExpression((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      return;
    }
    setExpression((prev) => {
      const isOperator = ['+', '-', '*', '/'].includes(key);
      if (prev === '0' && !isOperator && key !== '.') return key;
      if (prev === '0' && isOperator) return prev;
      const lastChar = prev[prev.length - 1];
      if (isOperator && ['+', '-', '*', '/'].includes(lastChar)) {
        return prev.slice(0, -1) + key;
      }
      return prev + key;
    });
  };

  const pickImage = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please grant access to continue.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsMultipleSelection: true });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setAttachments((prev) => [...prev, ...uris]);
    }
  };

  const handleSave = async () => {
    if (amount <= 0) {
      Alert.alert('Enter an amount', 'Amount must be greater than zero.');
      return;
    }
    if (!accountId) {
      Alert.alert('Select an account', 'Please choose an account.');
      return;
    }
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      Alert.alert('Select destination', 'Please choose a different destination account.');
      return;
    }

    const payload = {
      type,
      amount,
      currency: selectedAccount?.currency ?? DEFAULT_CURRENCY,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId,
      note,
      date: date.toISOString(),
      attachments,
      recurrence,
      nextOccurrence: null,
    };

    if (existing) {
      await updateTransaction(existing.id, payload);
    } else {
      await addTransaction(payload);
    }
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert('Delete transaction?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeTransaction(existing.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="close" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{existing ? 'Edit' : 'Add'} {TYPE_CONFIG[type].label}</Text>
        {existing ? (
          <Pressable onPress={handleDelete} hitSlop={10}>
            <Ionicons name="trash-outline" size={22} color={theme.danger} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <View style={styles.typeToggle}>
        {(Object.keys(TYPE_CONFIG) as TransactionType[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setType(t)}
            style={[
              styles.typeOption,
              { backgroundColor: type === t ? TYPE_CONFIG[t].color(theme) : theme.surfaceAlt },
            ]}
          >
            <Text style={{ color: type === t ? theme.textInverted : theme.textSecondary, fontWeight: '700', fontSize: fontSizes.sm }}>
              {TYPE_CONFIG[t].label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.amountArea}>
        <Text style={[styles.amountValue, { color: typeColor }]}>₹{formatExpressionDisplay(expression)}</Text>
        {expression.includes('+') || expression.includes('-') || expression.includes('*') || expression.includes('/') ? (
          <Text style={[styles.amountResult, { color: theme.textTertiary }]}>= {amount.toFixed(2)}</Text>
        ) : null}
      </View>

      <ScrollView style={styles.metaScroll} contentContainerStyle={{ paddingBottom: spacing.sm }} keyboardShouldPersistTaps="handled">
        {type !== 'transfer' && (
          <MetaRow
            icon={(selectedCategory?.icon as any) ?? 'pricetag-outline'}
            iconColor={selectedCategory?.color ?? theme.tint}
            label="Category"
            value={selectedCategory?.name ?? 'Select category'}
            onPress={() => setCategorySheetOpen(true)}
          />
        )}
        <MetaRow
          icon={(selectedAccount?.icon as any) ?? 'wallet-outline'}
          iconColor={selectedAccount?.color ?? theme.tint}
          label={type === 'transfer' ? 'From' : 'Account'}
          value={selectedAccount?.name ?? 'Select account'}
          onPress={() => setAccountSheetOpen(true)}
        />
        {type === 'transfer' && (
          <MetaRow
            icon={(selectedToAccount?.icon as any) ?? 'wallet-outline'}
            iconColor={selectedToAccount?.color ?? theme.tint}
            label="To"
            value={selectedToAccount?.name ?? 'Select account'}
            onPress={() => setToAccountSheetOpen(true)}
          />
        )}
        <MetaRow
          icon="calendar-outline"
          iconColor={theme.tint}
          label="Date & Time"
          value={format(date, "MMM d, yyyy '·' h:mm a")}
          onPress={() => setShowDatePicker(true)}
        />
        <View style={styles.quickDateRow}>
          <Pill label="Today" onPress={() => setDate(new Date())} />
          <Pill
            label="-1 day"
            onPress={() =>
              setDate((prev) => {
                const d = new Date(prev);
                d.setDate(d.getDate() - 1);
                return d;
              })
            }
          />
          <Pill label="Now" onPress={() => setDate(new Date())} />
        </View>

        <MetaRow
          icon="repeat-outline"
          iconColor={theme.tint}
          label="Repeat"
          value={RECURRENCE_OPTIONS.find((r) => r.key === recurrence)?.label ?? 'Never'}
          onPress={() => setRecurrenceSheetOpen(true)}
        />

        <View style={[styles.noteBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <Ionicons name="document-text-outline" size={18} color={theme.textTertiary} />
          <TextInput
            placeholder="Add a note"
            placeholderTextColor={theme.textTertiary}
            value={note}
            onChangeText={setNote}
            style={[styles.noteInput, { color: theme.text }]}
            multiline
          />
        </View>

        <View style={styles.attachmentsRow}>
          {attachments.map((uri) => (
            <View key={uri} style={styles.thumbWrap}>
              <Image source={{ uri }} style={styles.thumb} />
              <Pressable
                style={[styles.thumbRemove, { backgroundColor: theme.danger }]}
                onPress={() => setAttachments((prev) => prev.filter((u) => u !== uri))}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
          <Pressable style={[styles.addAttachment, { borderColor: theme.border }]} onPress={() => pickImage(false)}>
            <Ionicons name="image-outline" size={20} color={theme.textSecondary} />
          </Pressable>
          <Pressable style={[styles.addAttachment, { borderColor: theme.border }]} onPress={() => pickImage(true)}>
            <Ionicons name="camera-outline" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
      </ScrollView>

      <Keypad onKeyPress={onKeyPress} />

      <Pressable style={[styles.saveButton, { backgroundColor: typeColor }]} onPress={handleSave}>
        <Text style={styles.saveButtonLabel}>{existing ? 'Save Changes' : 'Save Transaction'}</Text>
      </Pressable>

      <BottomSheetModal visible={categorySheetOpen} onClose={() => setCategorySheetOpen(false)} title="Category">
        <View style={styles.categoryGrid}>
          {relevantCategories.map((c) => (
            <Pressable
              key={c.id}
              style={styles.categoryItem}
              onPress={() => {
                setCategoryId(c.id);
                setCategorySheetOpen(false);
              }}
            >
              <IconBadge icon={c.icon as any} color={c.color} size={52} />
              <Text style={[styles.categoryLabel, { color: theme.text }]} numberOfLines={1}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </BottomSheetModal>

      <BottomSheetModal visible={accountSheetOpen} onClose={() => setAccountSheetOpen(false)} title="Select Account">
        {accounts.map((a) => (
          <Pressable
            key={a.id}
            style={styles.accountOption}
            onPress={() => {
              setAccountId(a.id);
              setAccountSheetOpen(false);
            }}
          >
            <IconBadge icon={a.icon as any} color={a.color} />
            <Text style={[styles.accountOptionLabel, { color: theme.text }]}>{a.name}</Text>
            {a.id === accountId ? <Ionicons name="checkmark-circle" size={20} color={theme.tint} /> : null}
          </Pressable>
        ))}
      </BottomSheetModal>

      <BottomSheetModal visible={toAccountSheetOpen} onClose={() => setToAccountSheetOpen(false)} title="Destination Account">
        {accounts
          .filter((a) => a.id !== accountId)
          .map((a) => (
            <Pressable
              key={a.id}
              style={styles.accountOption}
              onPress={() => {
                setToAccountId(a.id);
                setToAccountSheetOpen(false);
              }}
            >
              <IconBadge icon={a.icon as any} color={a.color} />
              <Text style={[styles.accountOptionLabel, { color: theme.text }]}>{a.name}</Text>
              {a.id === toAccountId ? <Ionicons name="checkmark-circle" size={20} color={theme.tint} /> : null}
            </Pressable>
          ))}
      </BottomSheetModal>

      <BottomSheetModal visible={recurrenceSheetOpen} onClose={() => setRecurrenceSheetOpen(false)} title="Repeat" maxHeightPct={50}>
        {RECURRENCE_OPTIONS.map((r) => (
          <Pressable
            key={r.key}
            style={styles.accountOption}
            onPress={() => {
              setRecurrence(r.key);
              setRecurrenceSheetOpen(false);
            }}
          >
            <Text style={[styles.accountOptionLabel, { color: theme.text }]}>{r.label}</Text>
            {r.key === recurrence ? <Ionicons name="checkmark-circle" size={20} color={theme.tint} /> : null}
          </Pressable>
        ))}
      </BottomSheetModal>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          onChange={(_, selected) => {
            setShowDatePicker(false);
            if (selected) {
              const merged = new Date(date);
              merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
              setDate(merged);
              setShowTimePicker(true);
            }
          }}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={date}
          mode="time"
          onChange={(_, selected) => {
            setShowTimePicker(false);
            if (selected) {
              const merged = new Date(date);
              merged.setHours(selected.getHours(), selected.getMinutes());
              setDate(merged);
            }
          }}
        />
      )}
    </Screen>
  );
}

function MetaRow({
  icon,
  iconColor,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable style={styles.metaRow} onPress={onPress}>
      <IconBadge icon={icon} color={iconColor} size={36} />
      <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { fontSize: fontSizes.md, fontWeight: '700' },
  typeToggle: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, marginTop: spacing.xs },
  typeOption: { flex: 1, paddingVertical: spacing.xs, borderRadius: radius.pill, alignItems: 'center' },
  amountArea: { alignItems: 'center', paddingVertical: spacing.lg },
  amountValue: { fontSize: fontSizes.xxxl, fontWeight: '800', fontVariant: ['tabular-nums'] },
  amountResult: { fontSize: fontSizes.base, marginTop: spacing.xxs, fontVariant: ['tabular-nums'] },
  metaScroll: { flexGrow: 0, maxHeight: 230, paddingHorizontal: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  metaLabel: { fontSize: fontSizes.sm, fontWeight: '600', width: 66 },
  metaValue: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
  quickDateRow: { flexDirection: 'row', paddingLeft: 44, marginBottom: spacing.xs },
  noteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.xs },
  noteInput: { flex: 1, fontSize: fontSizes.base, minHeight: 20, padding: 0 },
  attachmentsRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' },
  thumbWrap: { width: 52, height: 52, borderRadius: radius.sm, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  thumbRemove: { position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  addAttachment: { width: 52, height: 52, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  saveButton: { marginHorizontal: spacing.md, marginBottom: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.lg, alignItems: 'center' },
  saveButtonLabel: { color: '#fff', fontWeight: '700', fontSize: fontSizes.base },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  categoryItem: { width: '23%', alignItems: 'center', marginBottom: spacing.md, gap: 4 },
  categoryLabel: { fontSize: fontSizes.xs, fontWeight: '600', textAlign: 'center' },
  accountOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  accountOptionLabel: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
});
