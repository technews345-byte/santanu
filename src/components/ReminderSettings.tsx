import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format } from 'date-fns';
import { Text } from '../theme/type';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, spacing } from '../theme/tokens';
import { useReminderStore } from '../store/useReminderStore';
import { ensurePermission, remindersSupported, sendTestReminder } from '../services/reminders';
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

  const sendTest = async () => {
    const sent = await sendTestReminder(settings.language);
    if (sent) showToast('A sample reminder is on its way 📬');
    else Alert.alert('Notifications are off', 'Allow notifications for Spendly in your phone’s settings first.');
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
            <Switch value={settings.enabled} onValueChange={toggleReminder} {...switchColors} />
          </View>

          {settings.enabled && (
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
});
