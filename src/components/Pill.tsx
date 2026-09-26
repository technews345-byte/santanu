import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '../theme/type';
import { useTheme } from '../theme/ThemeContext';
import { shade, withAlpha } from '../theme/color';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { GlassPressable } from './glass/GlassPressable';

/**
 * A small glass chip. Chosen, it becomes tinted glass lit from within;
 * otherwise it is the plain control glass every button is cut from.
 */
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
  const dark = theme.mode === 'dark';
  const accent = color ?? theme.tint;
  return (
    <GlassPressable
      feedback="press"
      level="control"
      blur={false}
      haptic={false}
      borderRadius={radius.pill}
      onPress={onPress}
      accessibilityLabel={label}
      style={styles.outer}
      contentStyle={styles.pill}
      tint={active ? withAlpha(accent, dark ? 0.26 : 0.14) : undefined}
      tintBorder={active ? withAlpha(accent, dark ? 0.55 : 0.4) : undefined}
    >
      <Text
        style={[
          styles.label,
          { color: active ? (dark ? shade(accent, 0.5) : shade(accent, -0.15)) : theme.textSecondary },
        ]}
      >
        {label}
      </Text>
    </GlassPressable>
  );
}

const styles = StyleSheet.create({
  outer: { marginRight: spacing.xs },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minHeight: 36, justifyContent: 'center' },
  label: { fontSize: fontSizes.sm, fontWeight: '700' },
});
