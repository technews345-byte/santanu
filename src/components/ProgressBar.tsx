import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { motion } from '../theme/tokens';

/**
 * The fill travels to a new value rather than jumping to it, so a budget
 * changing is something you watch happen. Width cannot be driven natively,
 * so this scales a full-width bar instead, which can be.
 */
export function ProgressBar({ progress, height = 10 }: { progress: number; height?: number }) {
  const { theme } = useTheme();
  const clamped = Math.min(Math.max(progress, 0), 1);
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(grow, { toValue: clamped, useNativeDriver: true, ...motion.enter }).start();
  }, [clamped]);

  // Green while there is room, amber as it runs out, red once it is gone.
  const [from, to] =
    progress >= 1
      ? [theme.danger, theme.expense]
      : progress >= 0.85
        ? [theme.warning, theme.expense]
        : [theme.success, theme.transfer];

  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: theme.surfaceAlt, borderColor: theme.borderSubtle }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            height,
            borderRadius: height / 2,
            // transformOrigin anchors it left, so it grows rightwards.
            transform: [{ scaleX: grow }],
          },
        ]}
      >
        <LinearGradient
          colors={[from, to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: height / 2 }]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, transformOrigin: 'left' },
});
