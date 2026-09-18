import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, spacing } from '../theme/tokens';

export interface TrendPoint {
  label: string;
  income: number;
  expense: number;
}

const AXIS_HEIGHT = 8;
const BAR_GAP = 3;

export function TrendChart({ data, height = 160 }: { data: TrendPoint[]; height?: number }) {
  const { theme } = useTheme();
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const plotHeight = height - AXIS_HEIGHT;
  const groupWidth = data.length > 0 ? width / data.length : 0;
  const barWidth = Math.max(4, Math.min(16, (groupWidth - BAR_GAP) / 2 - 6));

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Line x1={0} y1={plotHeight} x2={width} y2={plotHeight} stroke={theme.border} strokeWidth={1} />
          {data.map((d, idx) => {
            const centerX = groupWidth * idx + groupWidth / 2;
            const incomeHeight = (d.income / maxVal) * (plotHeight - 4);
            const expenseHeight = (d.expense / maxVal) * (plotHeight - 4);
            return (
              <React.Fragment key={idx}>
                <Rect
                  x={centerX - barWidth - BAR_GAP / 2}
                  y={plotHeight - incomeHeight}
                  width={barWidth}
                  height={incomeHeight}
                  rx={3}
                  fill={theme.success}
                />
                <Rect
                  x={centerX + BAR_GAP / 2}
                  y={plotHeight - expenseHeight}
                  width={barWidth}
                  height={expenseHeight}
                  rx={3}
                  fill={theme.expense}
                />
              </React.Fragment>
            );
          })}
        </Svg>
      )}
      <View style={styles.labelsRow}>
        {data.map((d, idx) => (
          <Text key={idx} style={[styles.label, { color: theme.textTertiary, width: groupWidth || undefined }]}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelsRow: { flexDirection: 'row', marginTop: spacing.xxs },
  label: { fontSize: fontSizes.xs, textAlign: 'center', fontWeight: '600' },
});
