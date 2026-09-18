import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useStore } from './src/store/useStore';
import { fontSizes, radius, spacing } from './src/theme/tokens';

function AppContent() {
  const { theme } = useTheme();
  const { hydrated, hydrationError, hydrate, biometricLockEnabled } = useStore();
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    hydrate();
  }, []);

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
      promptMessage: 'Unlock your ledger',
      fallbackLabel: 'Use passcode',
    });
    if (result.success) setUnlocked(true);
  };

  if (!hydrated) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.tint} />
      </View>
    );
  }

  if (hydrationError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Ionicons name="alert-circle-outline" size={44} color={theme.danger} />
        <Text style={[styles.lockTitle, { color: theme.text }]}>Couldn't load your data</Text>
        <Text style={[styles.errorDetail, { color: theme.textSecondary }]}>{hydrationError}</Text>
        <Pressable style={[styles.unlockButton, { backgroundColor: theme.tint }]} onPress={hydrate}>
          <Text style={styles.unlockLabel}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!unlocked) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Ionicons name="lock-closed-outline" size={44} color={theme.textSecondary} />
        <Text style={[styles.lockTitle, { color: theme.text }]}>Locked</Text>
        <Pressable style={[styles.unlockButton, { backgroundColor: theme.tint }]} onPress={authenticate}>
          <Text style={styles.unlockLabel}>Unlock</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </>
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
