import React, { useEffect, useRef } from 'react';
import { Animated, Image, LayoutChangeEvent, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../theme/useReducedMotion';
import { skin } from '../theme/skin';

const LOGO = require('../../assets/brand-mark.webp');
/** Finite spring launch; no permanent animation or added delay while data loads. */
export function BrandSplash({ ready, onFirstFrame, onFinish }: {
  ready: boolean; onFirstFrame: () => void; onFinish: () => void;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(reduced ? 1 : 0.84)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  useEffect(() => {
    if (reduced) { scale.stopAnimation(); scale.setValue(1); return; }
    const animation = Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...skin.spring });
    animation.start();
    return () => animation.stop();
  }, [reduced, scale]);
  useEffect(() => {
    if (!ready) return;
    const animation = reduced
      ? Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true })
      : Animated.spring(opacity, { toValue: 0, useNativeDriver: true, ...skin.spring, overshootClamping: true });
    animation.start(({ finished }) => { if (finished) finishRef.current(); });
    return () => animation.stop();
  }, [ready, reduced, opacity]);
  return <Animated.View pointerEvents="none" onLayout={(_: LayoutChangeEvent) => onFirstFrame()} style={[styles.fill, { backgroundColor: theme.bg, opacity }]}>
    <Animated.View style={{ transform: [{ scale }] }}><Image source={LOGO} resizeMode="contain" fadeDuration={0} style={styles.logo} /></Animated.View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  logo: { width: 190, height: 190 / (1072 / 1039) },
});
