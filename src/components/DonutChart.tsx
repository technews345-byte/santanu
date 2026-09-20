import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, spacing } from '../theme/tokens';
import { formatCurrency } from '../utils/finance';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  data,
  size = 200,
  strokeWidth = 26,
  centerLabel = 'Total',
}: {
  data: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
}) {
  const { theme } = useTheme();
  const radiusVal = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radiusVal;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  // Segments draw themselves on rather than appearing complete, and redraw
  // when the figures change, so switching between expenses, income and
  // investments is a movement instead of a swap.
  const sweep = useRef(new Animated.Value(0)).current;
  const signature = data.map((d) => `${d.color}:${d.value}`).join('|');

  useEffect(() => {
    sweep.setValue(0);
    Animated.timing(sweep, {
      toValue: 1,
      duration: 720,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      // strokeDasharray is an SVG attribute, not a transform.
      useNativeDriver: false,
    }).start();
  }, [signature]);

  let cumulative = 0;

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle cx={size / 2} cy={size / 2} r={radiusVal} stroke={theme.surfaceAlt} strokeWidth={strokeWidth} fill="none" />
          {total > 0 &&
            data.map((slice, idx) => {
              const fraction = slice.value / total;
              const dash = fraction * circumference;
              const gap = circumference - dash;
              const offset = -cumulative * circumference;
              cumulative += fraction;
              return (
                <AnimatedCircle
                  key={idx}
                  cx={size / 2}
                  cy={size / 2}
                  r={radiusVal}
                  stroke={slice.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={
                    sweep.interpolate({
                      inputRange: [0, 1],
                      outputRange: [`0 ${circumference}`, `${dash} ${gap}`],
                    }) as unknown as string
                  }
                  strokeDashoffset={offset}
                  // Rounded ends read as a ribbon rather than a cut pie. A
                  // segment too small to round is left square, since a cap
                  // wider than its own arc bulges past where it belongs.
                  strokeLinecap={dash > strokeWidth * 1.6 ? 'round' : 'butt'}
                  fill="none"
                />
              );
            })}
        </G>
      </Svg>
      <View style={styles.centerLabel} pointerEvents="none">
        <Text style={[styles.centerValue, { color: theme.text }]}>{formatCurrency(total)}</Text>
        <Text style={[styles.centerCaption, { color: theme.textTertiary }]}>{centerLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  centerLabel: { position: 'absolute', alignItems: 'center' },
  centerValue: { fontSize: fontSizes.lg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  centerCaption: { fontSize: fontSizes.xs, fontWeight: '600', marginTop: 2 },
});
