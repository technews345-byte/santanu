import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';

export function ProgressBar({ progress, height = 10 }: { progress: number; height?: number }) {
  const { theme } = useTheme();
  const clamped = Math.min(Math.max(progress, 0), 1.5);
  const fillColor = progress >= 1 ? theme.danger : progress >= 0.85 ? theme.warning : theme.success;
  const fillWidth = `${Math.min(clamped, 1) * 100}%`;

  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: theme.surfaceAlt }]}>
      <View
        style={[
          styles.fill,
          { width: fillWidth as any, height, borderRadius: height / 2, backgroundColor: fillColor },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0 },
});
