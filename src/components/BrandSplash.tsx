import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, LayoutChangeEvent, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// One transparent asset for both themes: the logo sits directly on the app's
// own background, with no container or plate behind it.
const LOGO = require('../../assets/splash-icon.png');

const LOGO_WIDTH = 230;
const LOGO_ASPECT = 863 / 1000;

const FADE_IN_MS = 520;
const SETTLE_MS = 200;
const FADE_OUT_MS = 340;
const BREATH_MS = 1900;

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
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const overlay = useRef(new Animated.Value(1)).current;
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: FADE_IN_MS + 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setIntroDone(true));

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
    if (!introDone || !ready) return;
    const timer = setTimeout(() => {
      Animated.timing(overlay, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinish();
      });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [introDone, ready]);

  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(_: LayoutChangeEvent) => onFirstFrame()}
      style={[styles.fill, { backgroundColor: theme.bg, opacity: overlay }]}
    >
      <Animated.View style={{ opacity, transform: [{ scale }, { scale: breathScale }] }}>
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
