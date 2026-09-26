import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, LayoutChangeEvent, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// One transparent asset for both themes: the logo sits directly on the app's
// own background, with no container or plate behind it.
const LOGO = require('../../assets/brand-mark.webp');

// The same size and place as the phone's own launch screen (the splash
// plugin's imageWidth in app.json), so the handoff from it is invisible: the
// logo is simply already there, and nothing jumps or cross-fades.
const LOGO_WIDTH = 190;
const LOGO_ASPECT = 1072 / 1039; // the supplied mark, very slightly wider than tall

const SETTLE_MS = 120;
const FADE_OUT_MS = 360;
const BREATH_MS = 2200;

// A single decelerating curve, used everywhere the app moves, so nothing
// stops abruptly: fast to leave, long to settle.
const GLIDE = Easing.bezier(0.22, 1, 0.36, 1);

export function BrandSplash({
  ready,
  onFirstFrame,
  onFinish,
}: {
  ready: boolean;
  onFirstFrame: () => void;
  onFinish: () => void;
}) {
  const { theme } = useTheme();
  const lift = useRef(new Animated.Value(1)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const overlay = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Barely-there breathing while waiting, so a slow start feels alive rather
    // than frozen. Loops until the splash leaves.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: BREATH_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: BREATH_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    if (!ready) return;
    // On the way out the logo comes a touch toward you as everything fades,
    // opening onto the app behind it.
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(overlay, { toValue: 0, duration: FADE_OUT_MS, easing: GLIDE, useNativeDriver: true }),
        Animated.timing(lift, { toValue: 1.08, duration: FADE_OUT_MS, easing: GLIDE, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onFinish();
      });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.022] });

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(_: LayoutChangeEvent) => onFirstFrame()}
      style={[styles.fill, { backgroundColor: theme.bg, opacity: overlay }]}
    >
      <Animated.View style={{ transform: [{ scale: lift }, { scale: breathScale }] }}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" fadeDuration={0} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  // Fixed aspect ratio, so the mark never stretches on any screen shape.
  logo: { width: LOGO_WIDTH, height: LOGO_WIDTH / LOGO_ASPECT },
});
