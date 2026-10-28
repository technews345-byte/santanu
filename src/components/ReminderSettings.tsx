import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../theme/type';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, spacing } from '../theme/tokens';
import { useReminderStore } from '../store/useReminderStore';
import { ensurePermission, notificationsAllowed, remindersSupported } from '../services/reminders';
import { Card } from './Card';

/** The one notification switch retains the existing reminder schedule and preferences. */
export function ReminderSettings() {
  const { theme } = useTheme();
  const enabled = useReminderStore(s => s.enabled);
  const update = useReminderStore(s => s.update);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    if (!remindersSupported) return;
    let alive = true;
    const check = () => notificationsAllowed().then(value => { if (alive) setAllowed(value); }).catch(() => { if (alive) setAllowed(false); });
    check();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => { alive = false; sub.remove(); };
  }, []);
  const toggle = async (value: boolean) => {
    if (busyRef.current) return;
    if (!value) { update({ enabled: false, offered: true }); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      const granted = await ensurePermission();
      setAllowed(granted);
      if (!granted) {
        Alert.alert('Notifications are off', 'Allow notifications for Raahi in your phone’s settings.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings().catch(() => {}) },
        ]);
        return;
      }
      update({ enabled: true, offered: true });
    } catch {
      Alert.alert('Notifications are unavailable', 'Please try again.');
    } finally { busyRef.current = false; setBusy(false); }
  };
  return <Card><View style={styles.row}>
    <Text style={[styles.label, { color: theme.text }]}>Notifications</Text>
    <Switch accessibilityLabel="Notifications" value={remindersSupported && enabled && allowed !== false} onValueChange={toggle}
      disabled={!remindersSupported || busy || allowed === null}
      trackColor={{ true: theme.tint, false: 'rgba(190,205,240,0.24)' }} thumbColor="#ECEFF6" />
  </View></Card>;
}
const styles = StyleSheet.create({
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { fontSize: fontSizes.base, fontWeight: '600' },
});
