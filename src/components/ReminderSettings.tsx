import React, { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format } from 'date-fns/format';
import { Text } from '../theme/type';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, spacing } from '../theme/tokens';
import { useReminderStore } from '../store/useReminderStore';
import { ensurePermission, notificationsAllowed, remindersSupported, sendTestReminder } from '../services/reminders';
import { ReminderLanguage } from '../utils/messages';
import { Card } from './Card';
import { Pill } from './Pill';
import { showToast } from './Toast';

const LANGUAGES: { key: ReminderLanguage; label: string }[] = [
  { key: 'en', label: 'English' },
  { key: 'hi', label: 'Hinglish' },
  { key: 'mix', label: 'Both' },
];

/** Settings for the evening reminder and the save confirmations. */
export function ReminderSettings() {
  const { theme } = useTheme();
  const settings = useReminderStore();
  const [picking, setPicking] = useState(false);
  // Whether the phone allows Spendly's notifications — checked again whenever
  // the app comes back, since that is where it gets changed.
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!remindersSupported) return;
    const check = () => notificationsAllowed().then(setAllowed).catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => sub.remove();
  }, []);
  const on = settings.enabled && allowed !== false;
  const blocked = settings.enabled && allowed === false;
  const time = format(new Date(2000, 0, 1, settings.hour, settings.minute), 'h:mm a');
  const switchColors = {
    trackColor: { true: theme.tint, false: theme.mode === 'dark' ? 'rgba(190, 205, 240, 0.24)' : 'rgba(100, 116, 139, 0.32)' },
    thumbColor: theme.mode === 'dark' ? '#ECEFF6' : '#FFFFFF',
  };

  const toggleReminder = async (value: boolean) => {
    if (!value) {
      settings.update({ enabled: false, offered: true });
      return;
    }
    const granted = await ensurePermission();
    setAllowed(granted);
    if (!granted) {
      Alert.alert(
        'Notifications are off',
        'Allow notifications for Spendly in your phone’s settings to get the daily reminder.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings().catch(() => {}) },
        ]
      );
      return;
    }
    settings.update({ enabled: true, offered: true });
    showToast(`Reminder set for ${time} ⏰`);
  };

  // Many phones (Vivo, Oppo, Xiaomi and others) stop an app's scheduled
  // reminders unless it is allowed to run in the background.
  const openBatterySettings = () => {
    Alert.alert(
      'Let reminders through',
      'Some phones stop reminders from apps that aren’t allowed to run in the background. In the next screen, find Spendly and choose “Don’t optimise” (or allow background activity / auto-start).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open settings',
          onPress: () =>
            Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(() =>
              Linking.openSettings().catch(() => {})
            ),
        },
      ]
    );
  };

  const sendTest = async () => {
    const sent = await sendTestReminder(settings.language);
    // The reminder itself drops down at once; a toast on top would cover it.
    if (!sent) Alert.alert('Notifications are off', 'Allow notifications for Spendly in your phone’s settings first.');
  };

  return (
    <Card>
      {remindersSupported && (
        <>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: theme.text }]}>Daily reminder</Text>
              <Text style={[styles.sub, { color: theme.textTertiary }]}>
                Every day at {time}, only if you haven’t added anything yet
              </Text>
            </View>
            <Switch value={on} onValueChange={toggleReminder} {...switchColors} />
          </View>

          {blocked && (
            <Pressable
              style={[styles.notice, { backgroundColor: theme.tintMuted }]}
              onPress={() => toggleReminder(true)}
              accessibilityRole="button"
            >
              <Ionicons name="notifications-off-outline" size={18} color={theme.warning} />
              <Text style={[styles.noticeText, { color: theme.text }]}>
                Notifications are blocked for Spendly. Tap to allow them.
              </Text>
            </Pressable>
          )}

          {on && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
              <Pressable style={styles.row} onPress={() => setPicking(true)} accessibilityRole="button">
                <Text style={[styles.label, { color: theme.text }]}>Reminder time</Text>
                <View style={styles.value}>
                  <Text style={[styles.valueText, { color: theme.tint }]}>{time}</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                </View>
              </Pressable>

              <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
              <Text style={[styles.label, { color: theme.text }]}>Language</Text>
              <View style={styles.pills}>
                {LANGUAGES.map((l) => (
                  <Pill
                    key={l.key}
                    label={l.label}
                    active={settings.language === l.key}
                    onPress={() => settings.update({ language: l.key })}
                  />
                ))}
              </View>
              <Text style={[styles.sample, { color: theme.textTertiary }]}>
                {settings.language === 'en'
                  ? '“Did you go shopping today? 🛍️”'
                  : settings.language === 'hi'
                    ? '“Aaj kitna kharcha hua? Track kar lo! 💸”'
                    : '“Aaj ka kharcha note kiya ya nahi? 😄”'}
              </Text>

              <Pressable style={styles.testRow} onPress={sendTest} accessibilityRole="button">
                <Ionicons name="notifications-outline" size={18} color={theme.tint} />
                <Text style={[styles.testLabel, { color: theme.tint }]}>Send a test reminder</Text>
              </Pressable>
              {Platform.OS === 'android' && (
                <Pressable style={styles.testRow} onPress={openBatterySettings} accessibilityRole="button">
                  <Ionicons name="battery-charging-outline" size={18} color={theme.textSecondary} />
                  <Text style={[styles.helpLabel, { color: theme.textSecondary }]}>
                    Reminders not arriving? Let Spendly run in the background
                  </Text>
                </Pressable>
              )}
            </>
          )}
          <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
        </>
      )}

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={[styles.label, { color: theme.text }]}>Save confirmations</Text>
          <Text style={[styles.sub, { color: theme.textTertiary }]}>“Grocery expense added 🛒” after you save</Text>
        </View>
        <Switch
          value={settings.confirmations}
          onValueChange={(value) => settings.update({ confirmations: value })}
          {...switchColors}
        />
      </View>

      {picking && Platform.OS !== 'web' && (
        <DateTimePicker
          value={new Date(2000, 0, 1, settings.hour, settings.minute)}
          mode="time"
          onChange={(event, selected) => {
            setPicking(false);
            if (event.type !== 'set' || !selected) return;
            settings.update({ hour: selected.getHours(), minute: selected.getMinutes() });
            showToast(`Reminder moved to ${format(selected, 'h:mm a')} ⏰`);
          }}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowText: { flex: 1 },
  label: { fontSize: fontSizes.base, fontWeight: '600' },
  sub: { fontSize: fontSizes.xs, marginTop: 2 },
  value: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  valueText: { fontSize: fontSizes.base, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
  pills: { flexDirection: 'row', marginTop: spacing.xs },
  sample: { fontSize: fontSizes.sm, marginTop: spacing.xs, fontStyle: 'italic' },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  testLabel: { fontSize: fontSizes.sm, fontWeight: '700' },
  helpLabel: { flex: 1, fontSize: fontSizes.sm, fontWeight: '600' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: 14, marginTop: spacing.sm },
  noticeText: { flex: 1, fontSize: fontSizes.sm, fontWeight: '600' },
});
