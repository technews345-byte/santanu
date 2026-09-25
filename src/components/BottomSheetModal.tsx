import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, motion, radius, spacing } from '../theme/tokens';
import { useReducedMotion } from '../theme/useReducedMotion';
import { GlassSurface } from './glass/GlassSurface';

/**
 * A sheet of glass drawn up over the screen.
 *
 * The room behind darkens first, so the sheet arrives as the nearest, most
 * solid pane in the app: backed opaque, since whatever it holds has to read
 * cleanly over any screen, but with the same lit edge and depth as the rest.
 * It springs up rather than sliding at a fixed speed, and on close it
 * travels back down before it goes, instead of vanishing mid-screen.
 */
export function BottomSheetModal({
  visible,
  onClose,
  title,
  children,
  maxHeightPct = 75,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxHeightPct?: number;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduced) {
        progress.setValue(1);
        return;
      }
      Animated.spring(progress, { toValue: 1, useNativeDriver: true, damping: 24, stiffness: 220, mass: 0.9 }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: reduced ? 0 : 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => finished && setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [520, 0] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay, opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        style={[styles.dock, { maxHeight: `${maxHeightPct}%`, transform: [{ translateY }] }]}
        pointerEvents="box-none"
      >
        <GlassSurface
          level="raised"
          opaque
          borderRadius={radius.xl}
          style={styles.sheet}
          // The bottom corners hang past the screen edge, so only the top
          // two are ever seen rounded.
          contentStyle={[styles.inner, { paddingBottom: spacing.lg + radius.xl + insets.bottom }]}
        >
          <View style={[styles.handle, { backgroundColor: theme.textTertiary }]} />
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={{ color: theme.tint, fontWeight: '700', fontSize: fontSizes.base }}>Done</Text>
            </Pressable>
          </View>
          {children}
        </GlassSurface>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: -radius.xl },
  sheet: {},
  inner: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.sm, opacity: 0.45 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: fontSizes.lg, fontWeight: '800', letterSpacing: -0.3 },
});
