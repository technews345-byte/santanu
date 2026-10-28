import React, { useEffect, useRef } from 'react';
import { Animated, Image, LayoutChangeEvent, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../theme/useReducedMotion';
import { skin } from '../theme/skin';

// The supplied portrait artwork fills the screen behind the system bars.
const SPLASH = require('../../assets/raahi-splash.jpg');
export function BrandSplash({ ready, onFirstFrame, onFinish }: {
  ready: boolean; onFirstFrame: () => void; onFinish: () => void;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  useEffect(() => {
    if (!ready) return;
    const animation = reduced
      ? Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true })
      : Animated.spring(opacity, { toValue: 0, useNativeDriver: true, ...skin.spring, overshootClamping: true });
    animation.start(({ finished }) => { if (finished) finishRef.current(); });
    return () => animation.stop();
  }, [ready, reduced, opacity]);
  return <Animated.View pointerEvents="none" onLayout={(_: LayoutChangeEvent) => onFirstFrame()} style={[styles.fill, { backgroundColor: theme.bg, opacity }]}>
    <Image source={SPLASH} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={0} />
  </Animated.View>;
}
const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
});
