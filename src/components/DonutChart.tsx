import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Text } from '../theme/type';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../theme/useReducedMotion';
import { fontSizes, spacing } from '../theme/tokens';
import { formatMoney } from '../utils/money';
import { Figure } from './Figure';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Arc left empty between neighbouring segments, in points. */
const GAP = 2;

/**
 * Shares of a total as a thin ring of light.
 *
 * Thinner than a pie so it reads as a luminous band in the glass rather than a
 * block of paint, with a small gap between segments instead of an outline —
 * neighbours separate by the space between them. Each segment keeps its
 * category's colour wherever that category appears, and the list beneath the
 * chart names every one, so identity never rests on the ring alone.
 *
 * The segments sweep on together, and redraw when the figures change, so
 * switching between expenses, income and investments is a movement rather
 * than a swap. The total at the centre counts to its new value.
 */
export function DonutChart({
  data,
  size = 200,
  strokeWidth = 16,
  centerLabel = 'Total',
}: {
  data: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const slices = data.filter((d) => d.value > 0);

  // The ring turns into place as it fades up, run by the native driver: the
  // segments themselves are drawn once, not re-drawn every frame.
  const sweepValue = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const sweep = 1;
  const signature = slices.map((d) => `${d.color}:${d.value}`).join('|');

  useEffect(() => {
    if (reduced) {
      sweepValue.setValue(1);
      return;
    }
    sweepValue.setValue(0);
    Animated.timing(sweepValue, {
      toValue: 1,
      duration: 760,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [signature, reduced]);

  const gap = slices.length > 1 ? GAP : 0;
  let cumulative = 0;

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={{
          opacity: sweepValue,
          transform: [
            { rotate: sweepValue.interpolate({ inputRange: [0, 1], outputRange: ['-110deg', '0deg'] }) },
            { scale: sweepValue.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
          ],
        }}
      >
      <Svg width={size} height={size}>
        {/* Start at twelve o'clock. A plain SVG transform, since the rotation
            and origin props become a CSS transform-origin the DOM rejects. */}
        <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.borderSubtle} strokeWidth={strokeWidth} fill="none" />
          {total > 0 &&
            slices.map((slice, idx) => {
              const fraction = slice.value / total;
              const start = cumulative * circumference * sweep;
              cumulative += fraction;
              const dash = Math.max(0.5, fraction * circumference * sweep - gap);
              return (
                <React.Fragment key={idx}>
                  {/* A faint wider pass beneath gives each band its glow. */}
                  <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={slice.color}
                    strokeOpacity={0.16}
                    strokeWidth={strokeWidth + 8}
                    strokeDasharray={[dash, circumference]}
                    strokeDashoffset={-start}
                    fill="none"
                  />
                  <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={slice.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={[dash, circumference]}
                    strokeDashoffset={-start}
                    fill="none"
                  />
                </React.Fragment>
              );
            })}
        </G>
      </Svg>
      </Animated.View>
      <View style={styles.centerLabel} pointerEvents="none">
        <Figure value={total} format={(n) => formatMoney(n)} style={[styles.centerValue, { color: theme.text }]} />
        <Text style={[styles.centerCaption, { color: theme.textTertiary }]}>{centerLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  centerLabel: { position: 'absolute', alignItems: 'center', paddingHorizontal: spacing.xl },
  centerValue: { fontSize: fontSizes.xl, fontWeight: '800', letterSpacing: -0.5 },
  centerCaption: { fontSize: fontSizes.xs, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.6 },
});
