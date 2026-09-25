import React, { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../theme/type';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../theme/useReducedMotion';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { roundedTopBar } from '../utils/curve';
import { formatMoney } from '../utils/money';

export interface TrendPoint {
  label: string;
  income: number;
  expense: number;
}

const AXIS_GAP = 2;
const PAIR_GAP = 2;
const MAX_BAR = 16;

/**
 * Income against expense, month by month.
 *
 * Thin columns rising from one baseline, rounded only at the data end and
 * square where they meet the axis, with a hairline gap inside each pair
 * rather than an outline. Each column is lit — full colour at its tip,
 * settling toward the base — so it reads as light standing in the glass. The
 * colours are the validated income/expense pair, and the legend above the
 * chart names them, so nothing depends on telling two hues apart.
 *
 * Tap a month to read its two figures; tap again or elsewhere to let go.
 */
export function TrendChart({ data, height = 160 }: { data: TrendPoint[]; height?: number }) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [rise, setRise] = useState(reduced ? 1 : 0);
  const riseValue = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  // One value drives every column, so they rise together rather than racing.
  // Path geometry can only change on the JS side, so this re-renders per frame
  // for the length of the rise — a dozen shapes, well within budget.
  useEffect(() => {
    const listener = riseValue.addListener(({ value }) => setRise(value));
    return () => riseValue.removeListener(listener);
  }, []);

  useEffect(() => {
    setPicked(null);
    if (reduced) {
      riseValue.setValue(1);
      return;
    }
    riseValue.setValue(0);
    Animated.timing(riseValue, {
      toValue: 1,
      duration: 680,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [data, reduced]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const plotHeight = height - AXIS_GAP;
  const groupWidth = data.length > 0 ? width / data.length : 0;
  const barWidth = Math.max(4, Math.min(MAX_BAR, (groupWidth - PAIR_GAP) / 2 - 8));

  return (
    <View>
      <View onLayout={onLayout}>
        {width > 0 && (
          <Svg width={width} height={height}>
            <Defs>
              {[
                ['in', theme.chartIncome],
                ['ex', theme.chartExpense],
              ].map(([key, color]) => (
                <LinearGradient key={key} id={`${id}${key}`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity={1} />
                  <Stop offset="1" stopColor={color} stopOpacity={0.62} />
                </LinearGradient>
              ))}
            </Defs>
            <Line x1={0} y1={plotHeight} x2={width} y2={plotHeight} stroke={theme.borderSubtle} strokeWidth={1} />
            {data.map((d, idx) => {
              const centerX = groupWidth * idx + groupWidth / 2;
              const incomeH = (d.income / maxVal) * (plotHeight - 6) * rise;
              const expenseH = (d.expense / maxVal) * (plotHeight - 6) * rise;
              const dim = picked !== null && picked !== idx ? 0.3 : 1;
              return (
                <React.Fragment key={idx}>
                  <Path
                    d={roundedTopBar(centerX - barWidth - PAIR_GAP / 2, plotHeight - incomeH, barWidth, incomeH)}
                    fill={`url(#${id}in)`}
                    opacity={dim}
                  />
                  <Path
                    d={roundedTopBar(centerX + PAIR_GAP / 2, plotHeight - expenseH, barWidth, expenseH)}
                    fill={`url(#${id}ex)`}
                    opacity={dim}
                  />
                </React.Fragment>
              );
            })}
          </Svg>
        )}

        {/* One tap target per month, the full height of the plot, so a thin
            column is as easy to hit as a wide one. */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.hitRow}>
            {data.map((d, idx) => (
              <Pressable
                key={idx}
                style={styles.hit}
                onPress={() => setPicked((p) => (p === idx ? null : idx))}
                accessibilityRole="button"
                accessibilityLabel={`${d.label}: income ${formatMoney(d.income)}, expense ${formatMoney(d.expense)}`}
              />
            ))}
          </View>
        </View>

        {picked !== null && width > 0 && (
          <Readout
            x={groupWidth * picked + groupWidth / 2}
            width={width}
            point={data[picked]}
            onDismiss={() => setPicked(null)}
          />
        )}
      </View>

      <View style={styles.labelsRow}>
        {data.map((d, idx) => (
          <Text
            key={idx}
            style={[
              styles.label,
              { color: picked === idx ? theme.text : theme.textTertiary, width: groupWidth || undefined },
            ]}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Readout({ x, width, point, onDismiss }: { x: number; width: number; point: TrendPoint; onDismiss: () => void }) {
  const { theme } = useTheme();
  const boxW = 156;
  const left = Math.max(0, Math.min(width - boxW, x - boxW / 2));
  const net = point.income - point.expense;
  return (
    <Pressable
      onPress={onDismiss}
      style={[
        styles.readout,
        {
          left,
          width: boxW,
          backgroundColor: theme.mode === 'dark' ? 'rgba(22, 27, 38, 0.95)' : 'rgba(255, 255, 255, 0.97)',
          borderColor: theme.glassBorder,
        },
      ]}
    >
      <Text style={[styles.readTitle, { color: theme.textSecondary }]}>{point.label}</Text>
      <ReadRow color={theme.chartIncome} label="Income" value={formatMoney(point.income)} />
      <ReadRow color={theme.chartExpense} label="Expense" value={formatMoney(point.expense)} />
      <View style={[styles.readRule, { backgroundColor: theme.borderSubtle }]} />
      <ReadRow label="Net" value={formatMoney(net)} />
    </Pressable>
  );
}

function ReadRow({ color, label, value }: { color?: string; label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.readRow}>
      <View style={[styles.readKey, { backgroundColor: color ?? 'transparent' }]} />
      <Text style={[styles.readLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.readValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hitRow: { flex: 1, flexDirection: 'row' },
  hit: { flex: 1 },
  labelsRow: { flexDirection: 'row', marginTop: spacing.xxs },
  label: { fontSize: fontSizes.xs, textAlign: 'center', fontWeight: '600' },
  readout: {
    position: 'absolute',
    top: 0,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 3,
  },
  readTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readKey: { width: 8, height: 8, borderRadius: 2 },
  readLabel: { fontSize: fontSizes.xs, fontWeight: '600', flex: 1 },
  readValue: { fontSize: fontSizes.xs, fontWeight: '800', fontVariant: ['tabular-nums'] },
  readRule: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
});
