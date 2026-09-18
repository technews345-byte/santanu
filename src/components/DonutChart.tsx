import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, spacing } from '../theme/tokens';
import { formatCurrency } from '../utils/finance';

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
                <Circle
                  key={idx}
                  cx={size / 2}
                  cy={size / 2}
                  r={radiusVal}
                  stroke={slice.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
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
