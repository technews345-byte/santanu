import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';
import { useReducedMotion } from '../../theme/useReducedMotion';
import { motion } from '../../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
/** A static ring in lists; optional UI-thread fill for featured details. */
export function ProgressRing({ progress, color, size = 64, children, animate = false }: {
  progress: number; color: string; size?: number; children?: React.ReactNode; animate?: boolean;
}) {
  const reduced = useReducedMotion();
  const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const fill = useSharedValue(animate && !reduced ? 0 : value);
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  useEffect(() => {
    fill.value = reduced || !animate ? value : withSpring(value, { ...motion.enter, overshootClamping: true });
  }, [value, reduced, animate, fill]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - fill.value) }));
  return <View style={{ width: size, height: size }} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={4} />
      <AnimatedCircle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`} animatedProps={arc} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
    </Svg>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
  </View>;
}
const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
