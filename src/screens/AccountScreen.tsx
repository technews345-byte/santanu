import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../theme/type';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { IconBadge } from '../components/IconBadge';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useAuthStore } from '../store/useAuthStore';
import { useStore } from '../store/useStore';
import { isCloudConfigured } from '../services/cloudConfig';
import { exportToXlsx } from '../utils/export';

const PROVIDER_LABELS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  'google.com': { label: 'Google', icon: 'logo-google', color: '#EA4335' },
  'facebook.com': { label: 'Facebook', icon: 'logo-facebook', color: '#1877F2' },
  phone: { label: 'Mobile number', icon: 'phone-portrait-outline', color: '#10B981' },
  password: { label: 'Email', icon: 'mail-outline', color: '#6366F1' },
};

export default function AccountScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { user, syncState, pendingCount, lastSyncedAt, syncNow, signOut, refreshPending } = useAuthStore();
  const { transactions, categories, accounts } = useStore();
  const [working, setWorking] = useState(false);

  useEffect(() => {
    refreshPending();
  }, []);

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'Your expenses stay on this device and sync again when you sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently removes your account and the copy of your data in the cloud. Expenses already on this device are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { deleteAccount } = require('../services/auth') as typeof import('../services/auth');
              await deleteAccount();
            } catch (e: any) {
              const { describeAuthError } = require('../services/auth') as typeof import('../services/auth');
              Alert.alert('Could not delete account', describeAuthError(e));
            }
          },
        },
      ]
    );
  };

  const handleExport = async () => {
    setWorking(true);
    try {
      await exportToXlsx({ transactions, categories, accounts, rangeLabel: 'All Transactions' });
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? 'Something went wrong');
    } finally {
      setWorking(false);
    }
  };

  const status = describeSync(syncState, pendingCount, lastSyncedAt);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Account</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxxl }}>
        <Card style={styles.profileCard}>
          {user?.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.tintMuted }]}>
              <Ionicons name="person-outline" size={28} color={theme.tint} />
            </View>
          )}
          <Text style={[styles.name, { color: theme.text }]}>
            {user?.displayName ?? (user ? 'Signed in' : 'Guest')}
          </Text>
          {user?.email && <Text style={[styles.detail, { color: theme.textSecondary }]}>{user.email}</Text>}
          {user?.phoneNumber && <Text style={[styles.detail, { color: theme.textSecondary }]}>{user.phoneNumber}</Text>}
          {!user && (
            <Text style={[styles.detail, { color: theme.textSecondary }]}>
              Not signed in — everything is saved on this device only.
            </Text>
          )}
        </Card>

        <SectionLabel label="Sync" />
        <Card>
          <View style={styles.row}>
            <IconBadge icon={status.icon} color={status.color(theme)} size={36} />
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{status.title}</Text>
              <Text style={[styles.rowSub, { color: theme.textTertiary }]}>{status.detail}</Text>
            </View>
            {user && (
              <Pressable onPress={() => syncNow()} hitSlop={8}>
                <Ionicons name="refresh" size={20} color={theme.tint} />
              </Pressable>
            )}
          </View>
        </Card>

        {user && (
          <>
            <SectionLabel label="Sign-in methods" />
            <Card padded={false}>
              {user.providers.map((id, idx) => {
                const meta = PROVIDER_LABELS[id] ?? { label: id, icon: 'key-outline' as const, color: theme.tint };
                return (
                  <View
                    key={id}
                    style={[
                      styles.listRow,
                      idx < user.providers.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.borderSubtle,
                      },
                    ]}
                  >
                    <IconBadge icon={meta.icon} color={meta.color} size={34} />
                    <Text style={[styles.listLabel, { color: theme.text }]}>{meta.label}</Text>
                    <Ionicons name="checkmark-circle" size={18} color={theme.success} />
                  </View>
                );
              })}
              <Pressable style={styles.listRow} onPress={() => navigation.navigate('Login')}>
                <IconBadge icon="add-outline" color={theme.tint} size={34} />
                <Text style={[styles.listLabel, { color: theme.tint }]}>Link another method</Text>
              </Pressable>
            </Card>
          </>
        )}

        <SectionLabel label="Data" />
        <Card>
          <Pressable style={styles.actionRow} onPress={handleExport} disabled={working}>
            <Ionicons name="download-outline" size={20} color={theme.tint} />
            <Text style={[styles.actionLabel, { color: theme.text }]}>Export my data</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
          </Pressable>
          {user && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
              <Pressable style={styles.actionRow} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={20} color={theme.textSecondary} />
                <Text style={[styles.actionLabel, { color: theme.text }]}>Sign out</Text>
              </Pressable>
              <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
              <Pressable style={styles.actionRow} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color={theme.danger} />
                <Text style={[styles.actionLabel, { color: theme.danger }]}>Delete account</Text>
              </Pressable>
            </>
          )}
        </Card>

        {!user && (
          <Pressable
            style={[styles.signInCta, { backgroundColor: theme.tint }]}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.signInLabel}>
              {isCloudConfigured ? 'Sign in to back up your expenses' : 'See sign-in options'}
            </Text>
          </Pressable>
        )}

        <Text style={[styles.privacy, { color: theme.textTertiary }]}>
          Expenses are stored on this device first, so the app keeps working offline. When you are signed in they are
          also sent over an encrypted connection to your account, which only your sign-in can reach.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function describeSync(state: string, pending: number, lastSyncedAt: string | null) {
  if (state === 'syncing') {
    return { title: 'Syncing…', detail: 'Bringing your devices up to date', icon: 'sync-outline' as const, color: (t: any) => t.tint };
  }
  if (state === 'offline') {
    return {
      title: 'Offline · saved on this device',
      detail: pending > 0 ? `${pending} change${pending === 1 ? '' : 's'} will upload automatically` : 'Nothing waiting to upload',
      icon: 'cloud-offline-outline' as const,
      color: (t: any) => t.warning,
    };
  }
  if (state === 'error') {
    return {
      title: "Couldn't sync right now",
      detail: 'Your expenses are safe on this device — we will try again automatically',
      icon: 'alert-circle-outline' as const,
      color: (t: any) => t.danger,
    };
  }
  if (pending > 0) {
    return {
      title: `${pending} change${pending === 1 ? '' : 's'} waiting`,
      detail: 'Will upload on the next sync',
      icon: 'cloud-upload-outline' as const,
      color: (t: any) => t.tint,
    };
  }
  return {
    title: 'Synced',
    detail: lastSyncedAt ? `Last synced ${format(parseISO(lastSyncedAt), 'MMM d, h:mm a')}` : 'Everything is up to date',
    icon: 'checkmark-circle-outline' as const,
    color: (t: any) => t.success,
  };
}

function SectionLabel({ label }: { label: string }) {
  const { theme } = useTheme();
  return <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { fontSize: fontSizes.md, fontWeight: '700' },
  profileCard: { alignItems: 'center', paddingVertical: spacing.lg },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: fontSizes.lg, fontWeight: '700', marginTop: spacing.sm },
  detail: { fontSize: fontSizes.sm, marginTop: 2, textAlign: 'center' },
  sectionLabel: { fontSize: fontSizes.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowText: { flex: 1 },
  rowTitle: { fontSize: fontSizes.base, fontWeight: '600' },
  rowSub: { fontSize: fontSizes.xs, marginTop: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  listLabel: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  actionLabel: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
  signInCta: { marginTop: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, alignItems: 'center' },
  signInLabel: { color: '#fff', fontWeight: '700', fontSize: fontSizes.base },
  privacy: { fontSize: fontSizes.xs, lineHeight: 17, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
});
