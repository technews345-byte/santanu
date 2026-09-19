import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';

export function Pill({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  const { theme } = useTheme();
  const activeColor = color ?? theme.tint;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: active ? activeColor : theme.surfaceAlt,
          borderColor: active ? activeColor : theme.border,
        },
      ]}
    >
      <Text style={[styles.label, { color: active ? theme.textInverted : theme.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: spacing.xs,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
});
