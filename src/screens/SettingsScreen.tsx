import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { IconBadge } from '../components/IconBadge';
import { Pill } from '../components/Pill';
import { useTheme } from '../theme/ThemeContext';
import { ThemePreference } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { CategoryType } from '../types';
import { exportToPdf, exportToXlsx } from '../utils/export';
import Constants from 'expo-constants';

const LOGO = require('../../assets/splash-icon.png');
// Read from app.json, so the credit never drifts from what was shipped.
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function SettingsScreen() {
  const { theme, preference, setPreference } = useTheme();
  const navigation = useNavigation<any>();
  const { accounts, categories, transactions, biometricLockEnabled, setBiometricLockEnabled } = useStore();
  const user = useAuthStore((s) => s.user);
  const pendingCount = useAuthStore((s) => s.pendingCount);
  const [categoryTab, setCategoryTab] = useState<CategoryType>('expense');
  const [exporting, setExporting] = useState(false);

  const visibleCategories = categories.filter((c) => c.type === categoryTab && !c.archived);

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert('Unavailable', 'No biometric authentication is set up on this device.');
        return;
      }
    }
    setBiometricLockEnabled(value);
  };

  const runExport = async (kind: 'xlsx' | 'pdf') => {
    setExporting(true);
    try {
      const ctx = { transactions, categories, accounts, rangeLabel: 'All Transactions' };
      if (kind === 'xlsx') await exportToXlsx(ctx);
      else await exportToPdf(ctx);
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? 'Something went wrong');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 168 }}>
        <Text style={[styles.title, { color: theme.text }]}>Settings</Text>

        <SectionLabel label="Account" />
        <Card padded={false}>
          <Pressable style={styles.listRow} onPress={() => navigation.navigate('Account')}>
            <IconBadge
              icon={user ? 'person-circle-outline' : 'cloud-upload-outline'}
              color={user ? theme.success : theme.tint}
              size={36}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.listLabel, { color: theme.text }]}>
                {user?.displayName ?? user?.email ?? user?.phoneNumber ?? 'Sync your expenses across devices'}
              </Text>
              <Text style={[styles.rowSub, { color: theme.textTertiary }]}>
                {user
                  ? pendingCount > 0
                    ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to upload`
                    : 'Backed up to your account'
                  : 'Create an account to securely back up your data'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
          </Pressable>
        </Card>

        <SectionLabel label="Appearance" />
        <Card>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Theme</Text>
            <View style={{ flexDirection: 'row' }}>
              {(['system', 'light', 'dark'] as ThemePreference[]).map((p) => (
                <Pill key={p} label={p.charAt(0).toUpperCase() + p.slice(1)} active={preference === p} onPress={() => setPreference(p)} />
              ))}
            </View>
          </View>
        </Card>

        <SectionLabel label="Security" />
        <Card>
          <View style={styles.row}>
            <View>
              <Text style={[styles.rowLabel, { color: theme.text }]}>Biometric Lock</Text>
              <Text style={[styles.rowSub, { color: theme.textTertiary }]}>Require Face ID / Fingerprint to open</Text>
            </View>
            <Switch value={biometricLockEnabled} onValueChange={handleBiometricToggle} trackColor={{ true: theme.tint }} />
          </View>
        </Card>

        <SectionLabel label="Accounts" action={{ label: 'Add', onPress: () => navigation.navigate('AccountForm', {}) }} />
        <Card padded={false}>
          {accounts.length === 0 && <Text style={[styles.emptyText, { color: theme.textTertiary }]}>No accounts yet</Text>}
          {accounts.map((a, idx) => (
            <Pressable
              key={a.id}
              style={[styles.listRow, idx < accounts.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderSubtle }]}
              onPress={() => navigation.navigate('AccountForm', { accountId: a.id })}
            >
              <IconBadge icon={a.icon as any} color={a.color} size={36} />
              <Text style={[styles.listLabel, { color: theme.text }]}>{a.name}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </Pressable>
          ))}
        </Card>

        <SectionLabel
          label="Categories"
          action={{ label: 'Add', onPress: () => navigation.navigate('CategoryForm', { type: categoryTab }) }}
        />
        <View style={styles.chipsRow}>
          <Pill label="Expense" active={categoryTab === 'expense'} color={theme.expense} onPress={() => setCategoryTab('expense')} />
          <Pill label="Income" active={categoryTab === 'income'} color={theme.success} onPress={() => setCategoryTab('income')} />
          <Pill label="Investment" active={categoryTab === 'investment'} color={theme.investment} onPress={() => setCategoryTab('investment')} />
        </View>
        <Card padded={false} style={{ marginTop: spacing.xs }}>
          {visibleCategories.length === 0 && <Text style={[styles.emptyText, { color: theme.textTertiary }]}>No categories yet</Text>}
          {visibleCategories.map((c, idx) => (
            <Pressable
              key={c.id}
              style={[styles.listRow, idx < visibleCategories.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderSubtle }]}
              onPress={() => navigation.navigate('CategoryForm', { categoryId: c.id, type: c.type })}
            >
              <IconBadge icon={c.icon as any} color={c.color} size={36} />
              <Text style={[styles.listLabel, { color: theme.text }]}>{c.name}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </Pressable>
          ))}
        </Card>

        <SectionLabel label="Data & Export" />
        <Card>
          <Pressable style={styles.exportRow} onPress={() => runExport('xlsx')} disabled={exporting}>
            <Ionicons name="grid-outline" size={20} color={theme.tint} />
            <Text style={[styles.exportLabel, { color: theme.text }]}>Export to Excel (.xlsx)</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
          <Pressable style={styles.exportRow} onPress={() => runExport('pdf')} disabled={exporting}>
            <Ionicons name="document-text-outline" size={20} color={theme.tint} />
            <Text style={[styles.exportLabel, { color: theme.text }]}>Export PDF Report</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
          </Pressable>
        </Card>

        <SectionLabel label="About" />
        <Card>
          <View style={styles.aboutHeader}>
            <Image source={LOGO} style={styles.aboutLogo} resizeMode="contain" />
            <Text style={[styles.aboutTitle, { color: theme.text }]}>About Spendly</Text>
          </View>

          <Text style={[styles.aboutBody, { color: theme.textSecondary }]}>
            Spendly is a simple and intuitive personal expense-tracking app designed to help you record,
            organize, and understand your daily spending. Track your expenses, manage your budget, and keep
            your finances organized—all in one place.
          </Text>

          <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />

          <Text style={[styles.aboutAuthor, { color: theme.text }]}>Built by Santanu Bordoloi</Text>
          <Text style={[styles.aboutBody, { color: theme.textSecondary }]}>
            Designed and developed with a focus on simplicity, privacy, and an easy-to-use experience.
          </Text>

          <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />

          <Text style={[styles.aboutMeta, { color: theme.textTertiary }]}>Version: {APP_VERSION}</Text>
          <Text style={[styles.aboutMeta, { color: theme.textTertiary }]}>
            © 2026 Santanu Bordoloi. All rights reserved.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function SectionLabel({ label, action }: { label: string; action?: { label: string; onPress: () => void } }) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{label}</Text>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={{ color: theme.tint, fontWeight: '700', fontSize: fontSizes.sm }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSizes.xl, fontWeight: '800', marginBottom: spacing.md },
  sectionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.xs },
  sectionLabel: { fontSize: fontSizes.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: fontSizes.base, fontWeight: '600' },
  rowSub: { fontSize: fontSizes.xs, marginTop: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  listLabel: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
  emptyText: { padding: spacing.md, fontSize: fontSizes.sm },
  chipsRow: { flexDirection: 'row' },
  exportRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  exportLabel: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
  aboutHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  aboutLogo: { width: 40, height: 40 },
  aboutTitle: { fontSize: fontSizes.base, fontWeight: '800' },
  aboutBody: { fontSize: fontSizes.sm, lineHeight: 20 },
  aboutAuthor: { fontSize: fontSizes.sm, fontWeight: '700', marginBottom: 2 },
  aboutMeta: { fontSize: fontSizes.xs, lineHeight: 18 },
});
