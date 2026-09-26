import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '../theme/type';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { GlassButton } from '../components/glass/GlassButton';
import { IconBadge } from '../components/IconBadge';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { effectiveBudgetFor, monthKeyFor, RECURRING_BUDGET_KEY } from '../utils/finance';

export default function BudgetFormScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { categoryId } = route.params;
  const { categories, budgets, setBudget, removeBudget } = useStore();

  const category = categories.find((c) => c.id === categoryId);
  const monthKey = monthKeyFor();
  const existing = effectiveBudgetFor(budgets, categoryId, monthKey);

  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [isRecurring, setIsRecurring] = useState(existing?.isRecurring ?? true);

  const handleSave = async () => {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      Alert.alert('Enter a valid amount');
      return;
    }
    await setBudget(categoryId, isRecurring ? RECURRING_BUDGET_KEY : monthKey, value, isRecurring);
    navigation.goBack();
  };

  const handleRemove = () => {
    if (!existing) return;
    Alert.alert('Remove budget?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeBudget(existing.id);
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Monthly Budget</Text>
        {existing ? (
          <Pressable onPress={handleRemove} hitSlop={10}>
            <Ionicons name="trash-outline" size={22} color={theme.danger} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.categoryHeader}>
          <IconBadge icon={(category?.icon as any) ?? 'pricetag-outline'} color={category?.color ?? theme.tint} size={56} />
          <Text style={[styles.categoryName, { color: theme.text }]}>{category?.name}</Text>
        </View>

        <View style={[styles.amountInputWrap, { borderColor: theme.border }]}>
          <Text style={[styles.currencyPrefix, { color: theme.textSecondary }]}>₹</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={theme.textTertiary}
            style={[styles.amountInput, { color: theme.text }]}
            autoFocus
          />
        </View>

        <View style={[styles.recurringRow, { borderColor: theme.border }]}>
          <View>
            <Text style={[styles.recurringLabel, { color: theme.text }]}>Repeat every month</Text>
            <Text style={[styles.recurringSub, { color: theme.textTertiary }]}>Applies automatically to future months</Text>
          </View>
          <Switch value={isRecurring} onValueChange={setIsRecurring} trackColor={{ true: theme.tint, false: theme.mode === 'dark' ? 'rgba(190, 205, 240, 0.24)' : 'rgba(100, 116, 139, 0.32)' }}
            thumbColor={theme.mode === 'dark' ? '#ECEFF6' : '#FFFFFF'} />
        </View>

        <GlassButton label="Save Budget" onPress={handleSave} style={styles.saveButton} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { fontSize: fontSizes.md, fontWeight: '700' },
  body: { padding: spacing.lg },
  categoryHeader: { alignItems: 'center', marginBottom: spacing.lg },
  categoryName: { fontSize: fontSizes.lg, fontWeight: '700', marginTop: spacing.sm },
  amountInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  currencyPrefix: { fontSize: fontSizes.xl, fontWeight: '700', marginRight: spacing.xs },
  amountInput: { flex: 1, fontSize: fontSizes.xl, fontWeight: '700' },
  recurringRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, marginTop: spacing.lg },
  recurringLabel: { fontSize: fontSizes.base, fontWeight: '600' },
  recurringSub: { fontSize: fontSizes.xs, marginTop: 2, maxWidth: 220 },
  saveButton: { marginTop: spacing.xl },
});
