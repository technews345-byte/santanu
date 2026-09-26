import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../theme/type';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { shade, withAlpha } from '../../theme/color';
import { fontSizes, motion, radius, spacing } from '../../theme/tokens';
import { GlassSurface } from './GlassSurface';

export interface TabOption<T extends string> {
  key: T;
  label: string;
}

/**
 * A segmented control where the selection is a single pane that travels.
 *
 * The selection is a small piece of brighter glass tinted with the accent —
 * the same material as the selected tab on the shelf below — rather than a
 * block of paint. One pane moves between positions rather than each option
 * lighting up in turn, so the eye follows the selection instead of hunting
 * for it. It glides on a spring: interrupt it mid-flight and it curves toward
 * the new target from wherever it had got to.
 */
export function GlassTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { theme } = useTheme();
  const dark = theme.mode === 'dark';
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const travel = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    Animated.spring(travel, { toValue: index, useNativeDriver: true, ...motion.glide }).start();
  }, [index]);

  // The row reports its outer width; the pill travels inside the padding.
  const slot = width > 0 ? (width - 8) / options.length : 0;
  const translateX = travel.interpolate({
    inputRange: options.map((_, i) => i),
    outputRange: options.map((_, i) => i * slot),
    extrapolate: 'clamp',
  });

  return (
    <GlassSurface level="row" borderRadius={radius.pill} blur={false} style={styles.track}>
      <View
        style={styles.row}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      >
        {slot > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pill,
              {
                width: slot,
                transform: [{ translateX }],
                shadowColor: theme.tint,
                shadowOpacity: dark ? 0.4 : 0.16,
              },
            ]}
          >
            <GlassSurface
              level="control"
              blur={false}
              borderRadius={radius.pill}
              style={styles.pillGlass}
              contentStyle={styles.pillGlass}
              tint={withAlpha(theme.tint, dark ? 0.3 : 0.14)}
              tintBorder={withAlpha(theme.tint, dark ? 0.55 : 0.35)}
            />
          </Animated.View>
        )}

        {options.map((option) => {
          const active = option.key === value;
          return (
            <Pressable
              key={option.key}
              onPress={() => {
                if (!active && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                onChange(option.key);
              }}
              style={styles.option}
              hitSlop={6}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.label,
                  { color: active ? (dark ? shade(theme.tint, 0.62) : shade(theme.tint, -0.2)) : theme.textSecondary },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  track: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', padding: 4 },
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: radius.pill,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  pillGlass: { flex: 1 },
  option: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs + 1 },
  label: { fontSize: fontSizes.sm, fontWeight: '700' },
});
