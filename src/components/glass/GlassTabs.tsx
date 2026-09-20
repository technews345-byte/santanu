import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { fontSizes, motion, radius, spacing } from '../../theme/tokens';
import { GlassSurface } from './GlassSurface';

export interface TabOption<T extends string> {
  key: T;
  label: string;
}

/**
 * A segmented control where the selection is a single pill that travels.
 *
 * One pill moves between positions rather than each option lighting up in
 * turn, so the eye follows the selection instead of hunting for it. It glides
 * on a spring: interrupt it mid-flight and it curves towards the new target
 * from wherever it had got to.
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
                backgroundColor: theme.tint,
                shadowColor: theme.tint,
              },
            ]}
          />
        )}

        {options.map((option) => {
          const active = option.key === value;
          return (
            <Pressable
              key={option.key}
              onPress={() => onChange(option.key)}
              style={styles.option}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.label,
                  { color: active ? theme.textInverted : theme.textSecondary },
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
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  option: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs + 1 },
  label: { fontSize: fontSizes.sm, fontWeight: '700' },
});
