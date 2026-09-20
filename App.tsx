import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { BrandSplash } from './src/components/BrandSplash';
import { useStore } from './src/store/useStore';
import { useAuthStore } from './src/store/useAuthStore';
import { fontSizes, radius, spacing } from './src/theme/tokens';

// Hold the native splash until the branded one is on screen, so the handoff
// between them has no gap to flash through.
SplashScreen.preventAutoHideAsync().catch(() => {});

function AppContent() {
  const { theme } = useTheme();
  const { hydrated, hydrationError, hydrate, biometricLockEnabled } = useStore();
  const initAuth = useAuthStore((s) => s.init);
  const authReady = useAuthStore((s) => s.ready);
  const [unlocked, setUnlocked] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    hydrate();
    initAuth();
  }, []);

  // Paint the root view in the theme colour too: it is what shows in the frame
  // between the native splash going away and React drawing.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.bg).catch(() => {});
  }, [theme.bg]);

  useEffect(() => {
    if (!hydrated) return;
    if (!biometricLockEnabled) {
      setUnlocked(true);
      return;
    }
    authenticate();
  }, [hydrated, biometricLockEnabled]);

  const authenticate = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Spendly',
      fallbackLabel: 'Use passcode',
    });
    if (result.success) setUnlocked(true);
  };

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
  ) : !unlocked ? (
    <View style={[styles.center, { backgroundColor: theme.bg }]}>
      <Ionicons name="lock-closed-outline" size={44} color={theme.textSecondary} />
      <Text style={[styles.lockTitle, { color: theme.text }]}>Locked</Text>
      <Pressable style={[styles.unlockButton, { backgroundColor: theme.tint }]} onPress={authenticate}>
        <Text style={styles.unlockLabel}>Unlock</Text>
      </Pressable>
    </View>
  ) : (
    <RootNavigator />
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {content}
      {!splashDone && (
        <BrandSplash
          ready={hydrated && authReady}
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
