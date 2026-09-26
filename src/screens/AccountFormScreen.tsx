import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../theme/type';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { GlassButton } from '../components/glass/GlassButton';
import { IconBadge } from '../components/IconBadge';
import { ColorPicker } from '../components/ColorPicker';
import { IconPicker, ACCOUNT_ICONS } from '../components/IconPicker';
import { Pill } from '../components/Pill';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { ACCOUNT_TYPE_LABELS, AccountType } from '../types';

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];

export default function AccountFormScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { accountId } = route.params ?? {};
  const { accounts, addAccount, updateAccount, removeAccount } = useStore();
  const existing = accounts.find((a) => a.id === accountId);

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AccountType>(existing?.type ?? 'cash');
  const [color, setColor] = useState(existing?.color ?? '#6366F1');
  const [icon, setIcon] = useState(existing?.icon ?? 'wallet-outline');
  const [initialBalance, setInitialBalance] = useState(existing ? String(existing.initialBalance) : '0');

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Enter a name');
      return;
    }
    const balance = parseFloat(initialBalance) || 0;
    if (existing) {
      await updateAccount(existing.id, { name: name.trim(), type, color, icon, initialBalance: balance });
    } else {
      await addAccount({ name: name.trim(), type, color, icon, initialBalance: balance, currency: 'INR' });
    }
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert('Delete account?', 'Transactions linked to this account will remain but reference a missing account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await removeAccount(existing.id); navigation.goBack(); } },
    ]);
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="close" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{existing ? 'Edit Account' : 'New Account'}</Text>
        {existing ? (
          <Pressable onPress={handleDelete} hitSlop={10}>
            <Ionicons name="trash-outline" size={22} color={theme.danger} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.previewRow}>
          <IconBadge icon={icon as any} color={color} size={64} />
        </View>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Personal Checking"
          placeholderTextColor={theme.textTertiary}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Type</Text>
        <View style={styles.chipsWrap}>
          {ACCOUNT_TYPES.map((t) => (
            <Pill key={t} label={ACCOUNT_TYPE_LABELS[t]} active={type === t} onPress={() => setType(t)} />
          ))}
        </View>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Initial Balance</Text>
        <TextInput
          value={initialBalance}
          onChangeText={setInitialBalance}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={theme.textTertiary}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Color</Text>
        <ColorPicker value={color} onChange={setColor} />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Icon</Text>
        <IconPicker icons={ACCOUNT_ICONS} value={icon} color={color} onChange={setIcon} />

        <GlassButton label="Save Account" onPress={handleSave} style={styles.saveButton} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { fontSize: fontSizes.md, fontWeight: '700' },
  body: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  previewRow: { alignItems: 'center', marginBottom: spacing.lg },
  label: { fontSize: fontSizes.sm, fontWeight: '700', marginBottom: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSizes.base },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  saveButton: { marginTop: spacing.xl },
});
