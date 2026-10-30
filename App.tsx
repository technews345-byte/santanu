import { useShallow } from 'zustand/react/shallow';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Pressable, StyleSheet, View } from 'react-native';
import { fontAssets, Text } from './src/theme/type';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { BrandSplash } from './src/components/BrandSplash';
import { useStore } from './src/store/useStore';
import { useAuthStore } from './src/store/useAuthStore';
import { initAds, preloadInterstitial } from './src/services/ads';
import { configureNotifications, ensurePermission, remindersSupported, rescheduleReminders } from './src/services/reminders';
import { useReminderStore } from './src/store/useReminderStore';
import { showToast, ToastHost } from './src/components/Toast';
import { format } from 'date-fns/format';
import { fontSizes, radius, spacing } from './src/theme/tokens';

// Hold the native splash until the branded one is on screen, so the handoff
// between them has no gap to flash through.
SplashScreen.preventAutoHideAsync().catch(() => {});

function AppContent() {
  const { theme } = useTheme();
  const { hydrated, hydrationError, hydrate, biometricLockEnabled, transactions, categories } = useStore(useShallow((s) => ({ hydrated: s.hydrated, hydrationError: s.hydrationError, hydrate: s.hydrate, biometricLockEnabled: s.biometricLockEnabled, transactions: s.transactions, categories: s.categories })));
  const reminders = useReminderStore();
  const initAuth = useAuthStore((s) => s.init);
  const authReady = useAuthStore((s) => s.ready);
  const [unlocked, setUnlocked] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  // The typefaces are bundled with the app, so this takes a moment; the
  // splash waits for it so nothing is ever drawn in a stand-in font first. A
  // face that fails to load falls back to the system's, never blocks launch.
  const [fontsLoaded, fontsError] = useFonts(fontAssets);
  const fontsReady = fontsLoaded || !!fontsError;

  useEffect(() => {
    hydrate();
    initAuth();
    // Google asks for the ads SDK to be initialized before the first ad is
    // requested; doing it here rather than on the Settings tap means the one
    // ad in the app is ready when someone asks for it. Deliberately not
    // awaited: nothing on screen depends on it, and it no-ops where ads are
    // unsupported.
    initAds();
    // Loaded early so one is ready at the first natural break.
    preloadInterstitial();
    useReminderStore.getState().load();
    configureNotifications();
  }, []);

  // Keep the fortnight of evening reminders in step with the settings and
  // the data: a save today takes today's reminder away, and every launch
  // rolls the schedule forward. Settled for a moment first, so a burst of
  // edits reschedules once.
  useEffect(() => {
    if (!hydrated || !reminders.loaded) return;
    const timer = setTimeout(() => {
      rescheduleReminders(reminders, transactions, categories);
    }, 1200);
    return () => clearTimeout(timer);
  }, [hydrated, reminders.loaded, reminders.enabled, reminders.offered, reminders.hour, reminders.minute, reminders.language, transactions, categories]);

  // Paint the root view in the theme colour too: it is what shows in the frame
  // between the native splash going away and React drawing.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.bg).catch(() => {});
  }, [theme.bg]);

  const authenticating = useRef(false);
  const appState = useRef(AppState.currentState);
  const everUnlocked = useRef(false);
  if (unlocked) everUnlocked.current = true;

  const authenticate = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Raahi',
        fallbackLabel: 'Use passcode',
      });
      if (result.success && appState.current !== 'background') setUnlocked(true);
    } catch {
      // Native failures leave the lock screen available for another attempt.
      setUnlocked(false);
    } finally {
      authenticating.current = false;
    }
  }, []);

  useEffect(() => {
    if (!hydrated || hydrationError) return;
    setUnlocked(!biometricLockEnabled);
    if (biometricLockEnabled) void authenticate();
  }, [hydrated, hydrationError, biometricLockEnabled, authenticate]);

  // Once the app is usable on the very first launch, ask once whether Raahi
  // may send its daily reminder (on by default).
  const reminderOffered = useRef(false);

  useEffect(() => {
    if (!unlocked || !splashDone || reminderOffered.current || !reminders.loaded) return;
    reminderOffered.current = true;
    const r = useReminderStore.getState();
    if (remindersSupported && r.enabled && !r.offered) {
      setTimeout(async () => {
        const granted = await ensurePermission();
        useReminderStore.getState().update({ offered: true });
        if (granted) {
          const time = format(new Date(2000, 0, 1, r.hour, r.minute), 'h:mm a');
          showToast(`Daily reminder on · ${time} ⏰`);
        }
      }, 700);
    }
  }, [unlocked, splashDone, reminders.loaded]);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      const previous = appState.current;
      appState.current = next;
      if (next === 'background' && biometricLockEnabled) {
        setUnlocked(false);
        return;
      }
      if (next !== 'active') return;
      if (previous === 'background') void hydrate();
      if (biometricLockEnabled && (previous === 'background' || !unlocked)) void authenticate();
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [unlocked, biometricLockEnabled, authenticate]);

  const handleSplashShown = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const content = hydrationError ? (
    <View style={[styles.center, { backgroundColor: theme.bg }]}>
      <Ionicons name="alert-circle-outline" size={44} color={theme.danger} />
      <Text style={[styles.lockTitle, { color: theme.text }]}>Couldn't load your data</Text>
      <Text style={[styles.errorDetail, { color: theme.textSecondary }]}>{hydrationError}</Text>
      <Pressable style={[styles.unlockButton, { backgroundColor: theme.tint }]} onPress={hydrate}>
        <Text style={styles.unlockLabel}>Retry</Text>
      </Pressable>
    </View>
  ) : (
    <>
      {everUnlocked.current && (
        <View style={[styles.flex, !unlocked && { display: 'none' }]}><RootNavigator /></View>
      )}
      {splashDone && hydrated && biometricLockEnabled && !unlocked && (
        <View style={[styles.center, { backgroundColor: theme.bg }]}>
          <Ionicons name="lock-closed-outline" size={44} color={theme.textSecondary} />
          <Text style={[styles.lockTitle, { color: theme.text }]}>Locked</Text>
          <Pressable style={[styles.unlockButton, { backgroundColor: theme.tint }]} onPress={authenticate}>
            <Text style={styles.unlockLabel}>Unlock</Text>
          </Pressable>
        </View>
      )}
    </>
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {content}
      <ToastHost />
      {!splashDone && (
        <BrandSplash
          ready={(hydrated || !!hydrationError) && authReady && fontsReady}
          onFirstFrame={handleSplashShown}
          onFinish={() => setSplashDone(true)}
        />
      )}
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  lockTitle: { fontSize: fontSizes.lg, fontWeight: '700' },
  errorDetail: { fontSize: fontSizes.sm, textAlign: 'center', paddingHorizontal: spacing.xl },
  unlockButton: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.pill, marginTop: spacing.sm },
  unlockLabel: { color: '#fff', fontWeight: '700', fontSize: fontSizes.base },
});
