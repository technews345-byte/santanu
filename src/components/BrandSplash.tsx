import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, LayoutChangeEvent, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';

const LOGO_LIGHT = require('../../assets/splash-icon.png');
const LOGO_DARK = require('../../assets/splash-icon-dark.png');

// Matches the native splash so the handoff between them is invisible.
const LOGO_WIDTH = 240;
const LOGO_ASPECT = 1051 / 1076;

const FADE_IN_MS = 520;
const SETTLE_MS = 240;
const FADE_OUT_MS = 360;

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
  const scale = useRef(new Animated.Value(0.92)).current;
  const overlay = useRef(new Animated.Value(1)).current;
  const sweep = useRef(new Animated.Value(0)).current;
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
        duration: FADE_IN_MS + 60,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sweep, {
        toValue: 1,
        duration: 900,
        delay: 160,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => setIntroDone(true));
  }, []);

  // Leave only once the intro has played and the app behind is ready, so the
  // splash never cuts off mid-animation and never outstays the data load.
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

  const handleLayout = (_: LayoutChangeEvent) => onFirstFrame();

  const sweepTranslate = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-LOGO_WIDTH, LOGO_WIDTH * 1.6],
  });

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={handleLayout}
      style={[styles.fill, { backgroundColor: theme.bg, opacity: overlay }]}
    >
      <Animated.View style={[styles.logoWrap, { opacity, transform: [{ scale }] }]}>
        <Image
          source={theme.mode === 'dark' ? LOGO_DARK : LOGO_LIGHT}
          style={styles.logo}
          resizeMode="contain"
          fadeDuration={0}
        />
        <Animated.View style={[styles.sweep, { transform: [{ translateX: sweepTranslate }, { rotate: '18deg' }] }]}>
          <LinearGradient
            colors={['transparent', theme.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
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
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  logoWrap: {
    width: LOGO_WIDTH,
    height: LOGO_WIDTH / LOGO_ASPECT,
    overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%' },
  sweep: { position: 'absolute', top: 0, bottom: 0, width: LOGO_WIDTH * 0.45 },
});
