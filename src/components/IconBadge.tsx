import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { shade, withAlpha } from '../theme/color';

/**
 * A small capsule of frosted glass holding an icon.
 *
 * The glass is tinted from the thing it names — a category, an account — so
 * identity still travels with colour, but as light coming through the capsule
 * rather than a disc of paint. The icon itself carries the colour at full
 * strength, lifted a step on dark so a deep indigo or violet still clears
 * the 3:1 an icon needs against the glass it sits on.
 *
 * Every category, account and action wears one of these, so the app reads as
 * one set of objects.
 */
export function IconBadge({
  icon,
  color,
  size = 40,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  size?: number;
  /** Kept for callers that set it; the capsule scales its own glyph. */
  iconSize?: number;
}) {
  const { theme } = useTheme();
  const dark = theme.mode === 'dark';
  const r = size / 2;

  return (
    <View style={[styles.capsule, { width: size, height: size, borderRadius: r }]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: r, backgroundColor: withAlpha(color, dark ? 0.17 : 0.12) },
        ]}
      />
      {/* Light enters at the top and fades — the same source as every pane. */}
      <LinearGradient
        colors={[dark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.7)', 'transparent']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.6, y: 0.75 }}
        style={[StyleSheet.absoluteFill, { borderRadius: r }]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: r, borderWidth: 1, borderColor: withAlpha(color, dark ? 0.36 : 0.28) },
        ]}
      />
      <Ionicons name={icon} size={Math.round(size * 0.46)} color={dark ? shade(color, 0.28) : shade(color, -0.12)} />
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
