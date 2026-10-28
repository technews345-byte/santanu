import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { motion, radius } from '../../theme/tokens';
import { useReducedMotion } from '../../theme/useReducedMotion';
import { GlassLevel, GlassSurface } from './GlassSurface';

/** Responsive touch feedback without measuring or rerendering on every touch. */
export function GlassPressable({
  children, onPress, onLongPress, disabled, busy = false, level = 'panel',
  blur = true, opaque = false, feedback = 'press', style, contentStyle,
  borderRadius = radius.xl, haptic = true, accessibilityLabel, tint, tintBorder,
}: {
  children?: React.ReactNode; onPress?: () => void; onLongPress?: () => void;
  disabled?: boolean; busy?: boolean; level?: GlassLevel; blur?: boolean; opaque?: boolean;
  feedback?: 'lift' | 'press'; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>;
  borderRadius?: number; haptic?: boolean; accessibilityLabel?: string; tint?: string; tintBorder?: string;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const press = useRef(new Animated.Value(0)).current;
  useEffect(() => () => press.stopAnimation(), [press]);
  const moveTo = (toValue: number) => {
    if (reduced) { press.stopAnimation(); press.setValue(toValue); return; }
    Animated.spring(press, { toValue, useNativeDriver: true, ...motion.press }).start();
  };
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, reduced ? 1 : feedback === 'lift' ? 0.975 : motion.pressScale] });
  return (
    <Pressable disabled={disabled} onPressIn={() => moveTo(1)} onPressOut={() => moveTo(0)}
      onPress={() => {
        if (haptic && Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, busy }} style={style}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <GlassSurface level={level} blur={blur} opaque={opaque} borderRadius={borderRadius}
          contentStyle={contentStyle} tint={tint} tintBorder={tintBorder}>{children}</GlassSurface>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
          borderRadius, borderWidth: 1,
          borderColor: theme.mode === 'dark' ? 'rgba(192, 226, 255, 0.42)' : theme.tint,
          backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)',
          opacity: press,
        }]} />
      </Animated.View>
    </Pressable>
  );
}
