import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useReducedMotion } from '../../theme/useReducedMotion';
import { motion } from '../../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
/** The arc animates; its label and semantic value always report the real total. */
export function ProgressRing({ progress, color, size = 64, children }: {
  progress: number; color: string; size?: number; children?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const fill = useRef(new Animated.Value(reduced ? value : 0)).current;
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  useEffect(() => {
    if (reduced) { fill.stopAnimation(); fill.setValue(value); return; }
    // SVG dash offset cannot use RN's native driver. Only the handful of
    // budget rings run this; row lists never animate their geometry.
    const animation = Animated.spring(fill, { toValue: value, useNativeDriver: false, ...motion.enter });
    animation.start();
    return () => animation.stop();
  }, [value, reduced, fill]);
  return <View style={{ width: size, height: size }} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={4} />
      <AnimatedCircle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={fill.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })}
        rotation={-90} origin={`${size / 2}, ${size / 2}`} />
    </Svg>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
  </View>;
}
const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
