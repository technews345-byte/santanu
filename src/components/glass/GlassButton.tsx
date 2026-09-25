import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { withAlpha } from '../../theme/color';
import { fontSizes, radius, spacing } from '../../theme/tokens';
import { GlassPressable } from './GlassPressable';

/**
 * A button made of the same glass as everything else.
 *
 * - `primary`: brighter glass tinted with the accent — light through coloured
 *   glass, with the colour catching at the rim and a faint glow of it below.
 * - `secondary`: plain dark glass.
 *
 * Deliberately not a flat gradient slab: every other surface in the app is a
 * pane with depth, and a painted button would be the one thing that isn't.
 * Pressing sinks it rather than lifting it, because that is what a button
 * does under a finger.
 */
export function GlassButton({
  label,
  onPress,
  variant = 'primary',
  color,
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  /** Accent for a primary button; defaults to the app's accent. */
  color?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const dark = theme.mode === 'dark';
  const accent = color ?? theme.tint;
  const primary = variant === 'primary';

  const labelColor = primary ? (dark ? '#F4F6FF' : accent) : theme.text;

  return (
    <View
      style={[
        primary && {
          shadowColor: accent,
          shadowOpacity: dark ? 0.35 : 0.2,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        },
        { opacity: disabled ? 0.45 : 1, borderRadius: radius.lg },
        style,
      ]}
    >
      <GlassPressable
        feedback="press"
        level="control"
        borderRadius={radius.lg}
        disabled={disabled}
        onPress={onPress}
        accessibilityLabel={label}
        tint={primary ? withAlpha(accent, dark ? 0.3 : 0.14) : undefined}
        tintBorder={primary ? withAlpha(accent, dark ? 0.55 : 0.4) : undefined}
        contentStyle={styles.inner}
      >
        {icon && <Ionicons name={icon} size={18} color={labelColor} />}
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      </GlassPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  label: { fontSize: fontSizes.base, fontWeight: '700', letterSpacing: 0.1 },
});
