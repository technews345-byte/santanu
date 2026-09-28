import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { Text } from '../theme/type';
import { useTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../theme/useReducedMotion';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { GlassSurface } from './glass/GlassSurface';

const VISIBLE_MS = 2200;

const useToastStore = create<{ text: string | null; key: number; show: (text: string) => void }>((set) => ({
  text: null,
  key: 0,
  show: (text) => set((s) => ({ text, key: s.key + 1 })),
}));

/** A short line at the top of the screen that goes away by itself. */
export const showToast = (text: string) => useToastStore.getState().show(text);

/**
 * Where toasts appear. Mounted once, above everything, and inert to touch:
 * a confirmation never gets between a finger and what is underneath it.
 */
export function ToastHost() {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { text, key } = useToastStore();
  const shown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!text) return;
    shown.setValue(0);
    const enter = reduced
      ? Animated.timing(shown, { toValue: 1, duration: 120, useNativeDriver: true })
      : Animated.spring(shown, { toValue: 1, damping: 18, stiffness: 220, useNativeDriver: true });
    const leave = Animated.timing(shown, {
      toValue: 0,
      duration: 260,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    const run = Animated.sequence([enter, Animated.delay(VISIBLE_MS), leave]);
    run.start();
    return () => run.stop();
  }, [key]);

  if (!text) return null;

  return (
    <View pointerEvents="none" style={[styles.host, { top: insets.top + spacing.xs }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={{
          opacity: shown,
          transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }],
        }}
      >
        <GlassSurface level="control" opaque borderRadius={radius.pill} contentStyle={styles.pill}>
          <Text style={[styles.text, { color: theme.text }]} numberOfLines={2}>
            {text}
          </Text>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center', zIndex: 50 },
  pill: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  text: { fontSize: fontSizes.base, fontWeight: '600', textAlign: 'center' },
});
