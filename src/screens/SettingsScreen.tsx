import React, { useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../theme/type';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { adsSupported, showRewardedAd } from '../services/ads';
import Constants from 'expo-constants';

const LOGO = require('../../assets/brand-mark.webp');
// Read from app.json, so the credit never drifts from what was shipped.
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function SettingsScreen() {
  const { theme, preference, setPreference } = useTheme();
  const navigation = useNavigation<any>();
  const {
    accounts,
    categories,
    transactions,
    biometricLockEnabled,
    setBiometricLockEnabled,
    supportCount,
    recordSupport,
  } = useStore();
  const user = useAuthStore((s) => s.user);
  const pendingCount = useAuthStore((s) => s.pendingCount);
  const [exporting, setExporting] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const canShowAds = adsSupported();

  const activeCategories = categories.filter((c) => !c.archived);
  const countOf = (type: CategoryType) => activeCategories.filter((c) => c.type === type).length;

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
      // The report is addressed to whoever is signed in.
      const ctx = { transactions, categories, accounts, rangeLabel: 'All Transactions', user };
      if (kind === 'xlsx') await exportToXlsx(ctx);
      else await exportToPdf(ctx);
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? 'Something went wrong');
    } finally {
      setExporting(false);
    }
  };

  /**
   * The one place Spendly shows an ad, and only when asked. The reward is a
   * thank-you rather than access to anything: gating a feature people already
   * have behind an ad would be taking something away.
   */
  const handleSupport = async () => {
    setWatchingAd(true);
    try {
      const outcome = await showRewardedAd({ userId: user?.uid, customData: 'support' });
      if (outcome.status === 'earned') {
        recordSupport();
        Alert.alert('Thank you!', 'That genuinely helps keep Spendly free.');
      } else if (outcome.status === 'dismissed') {
        Alert.alert('No reward earned', 'The ad closed early, so nothing was counted. Feel free to try again.');
      } else {
        Alert.alert('No ad available', outcome.reason);
      }
    } finally {
      setWatchingAd(false);
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
            <Switch value={biometricLockEnabled} onValueChange={handleBiometricToggle} trackColor={{ true: theme.tint, false: theme.mode === 'dark' ? 'rgba(190, 205, 240, 0.24)' : 'rgba(100, 116, 139, 0.32)' }}
            thumbColor={theme.mode === 'dark' ? '#ECEFF6' : '#FFFFFF'} />
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

        {/* Categories are edited now and then, not read: one row here, the
            full list a tap away rather than thirty rows in the middle of
            Settings. */}
        <SectionLabel label="Categories" />
        <Card padded={false}>
          <Pressable
            style={styles.listRow}
            onPress={() => navigation.navigate('Categories')}
            accessibilityRole="button"
            accessibilityLabel="Manage categories"
          >
            <View style={styles.categoryStack}>
              {activeCategories.slice(0, 3).map((c, i) => (
                <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -14, zIndex: 3 - i }}>
                  <IconBadge icon={c.icon as any} color={c.color} size={36} />
                </View>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>Manage categories</Text>
              <Text style={[styles.rowSub, { color: theme.textTertiary }]}>
                {countOf('expense')} expense · {countOf('income')} income · {countOf('investment')} investment
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
          </Pressable>
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

        <SectionLabel label="Support" />
        <Card>
          <View style={styles.supportHeader}>
            <IconBadge icon="heart" color={theme.expense} size={40} />
            <View style={styles.supportHeading}>
              <Text style={[styles.supportTitle, { color: theme.text }]}>Support Spendly</Text>
              <Text style={[styles.supportBody, { color: theme.textSecondary }]}>
                Spendly has no ads anywhere else and never sells your data. If you would like to chip
                in, watching one short ad is the whole ask.
              </Text>
            </View>
          </View>

          {supportCount > 0 && (
            <View style={[styles.supporterBadge, { backgroundColor: theme.successMuted }]}>
              <Ionicons name="ribbon" size={15} color={theme.success} />
              <Text style={[styles.supporterLabel, { color: theme.success }]}>
                Supporter · {supportCount} {supportCount === 1 ? 'ad' : 'ads'} watched
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.supportButton, { borderColor: theme.tint, opacity: canShowAds ? 1 : 0.5 }]}
            onPress={handleSupport}
            disabled={watchingAd || !canShowAds}
          >
            <Ionicons
              name={watchingAd ? 'hourglass-outline' : 'play-circle-outline'}
              size={20}
              color={theme.tint}
            />
            <Text style={[styles.supportButtonLabel, { color: theme.tint }]}>
              {watchingAd
                ? 'Loading ad\u2026'
                : canShowAds
                  ? 'Watch a short ad'
                  : 'Not available in this build'}
            </Text>
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

          <Text style={[styles.aboutAuthor, { color: theme.text }]}>Developed by Santanu Bordoloi</Text>
          <Text style={[styles.aboutBody, { color: theme.textSecondary }]}>
            Designed and developed with a focus on simplicity, privacy, and an easy-to-use experience.
          </Text>

          <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />

          <Text style={[styles.aboutMeta, { color: theme.textTertiary }]}>Version: {APP_VERSION}</Text>
          <Text style={[styles.aboutMeta, { color: theme.textTertiary }]}>
            © 2026 Santanu Bordoloi. All rights reserved.
          </Text>
          {/* The 3D objects in the background come from a stock file whose
              licence asks for this credit. */}
          <Text style={[styles.aboutMeta, { color: theme.textTertiary }]}>
            Background artwork: Image by Xvector on{' '}
            <Text
              style={{ color: theme.tint }}
              onPress={() => Linking.openURL('https://www.freepik.com').catch(() => {})}
              accessibilityRole="link"
            >
              Freepik
            </Text>
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
  supportHeader: { flexDirection: 'row', gap: spacing.sm },
  supportHeading: { flex: 1, gap: spacing.xxs },
  supportTitle: { fontSize: fontSizes.base, fontWeight: '700' },
  supportBody: { fontSize: fontSizes.sm, lineHeight: 19 },
  supporterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  supporterLabel: { fontSize: fontSizes.xs, fontWeight: '700' },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.4,
  },
  supportButtonLabel: { fontSize: fontSizes.base, fontWeight: '700' },
  title: { fontSize: fontSizes.xl, fontWeight: '800', marginBottom: spacing.md },
  sectionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.xs },
  sectionLabel: { fontSize: fontSizes.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: fontSizes.base, fontWeight: '600' },
  rowSub: { fontSize: fontSizes.xs, marginTop: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  listLabel: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
  emptyText: { padding: spacing.md, fontSize: fontSizes.sm },
  categoryStack: { flexDirection: 'row', alignItems: 'center' },
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
