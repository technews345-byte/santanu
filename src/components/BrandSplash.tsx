import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';

// One transparent asset for both themes: the logo sits directly on the app's
// own background, with no container or plate behind it.
const LOGO = require('../../assets/splash-icon.png');

const LOGO_WIDTH = 236;
const LOGO_ASPECT = 1072 / 1039; // the supplied mark, very slightly wider than tall

const FADE_IN_MS = 560;
const SETTLE_MS = 180;
const FADE_OUT_MS = 380;
const BREATH_MS = 2200;
const WAVE_MS = 5200;

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
  const wave = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const overlay = useRef(new Animated.Value(1)).current;
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        easing: GLIDE,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: FADE_IN_MS + 120,
        easing: GLIDE,
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

    // Two tides of the same wave, drifting at different speeds, so the crest
    // never repeats on a beat you can count. Translation only, so it runs on
    // the native side and costs the splash nothing.
    const drift = Animated.loop(
      Animated.timing(wave, {
        toValue: 1,
        duration: WAVE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    drift.start();

    return () => {
      loop.stop();
      drift.stop();
    };
  }, []);

  useEffect(() => {
    if (!introDone || !ready) return;
    const timer = setTimeout(() => {
      Animated.timing(overlay, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: GLIDE,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinish();
      });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [introDone, ready]);

  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.022] });

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(_: LayoutChangeEvent) => onFirstFrame()}
      style={[styles.fill, { backgroundColor: theme.bg, opacity: overlay }]}
    >
      <LiquidWave progress={wave} />

      <Animated.View style={{ opacity, transform: [{ scale }, { scale: breathScale }] }}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" fadeDuration={0} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The tide behind the logo: two copies of one wave laid end to end and slid
 * sideways, which reads as endless motion without ever redrawing the shape.
 */
function LiquidWave({ progress }: { progress: Animated.Value }) {
  const { theme } = useTheme();
  const width = Dimensions.get('window').width;
  const height = 240;

  const near = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -width] });
  const far = progress.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.35, -width * 1.35] });

  return (
    <View pointerEvents="none" style={[styles.waves, { height }]}>
      <Animated.View style={{ transform: [{ translateX: far }] }}>
        <Crest width={width} height={height} from={theme.auroraTwo} to="transparent" amplitude={26} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: near }] }]}>
        <Crest width={width} height={height} from={theme.auroraOne} to="transparent" amplitude={18} />
      </Animated.View>
    </View>
  );
}

function Crest({
  width,
  height,
  from,
  to,
  amplitude,
}: {
  width: number;
  height: number;
  from: string;
  to: string;
  amplitude: number;
}) {
  const id = `wave-${amplitude}`;
  const mid = height * 0.42;
  // Two full periods across twice the width, so sliding by one width lands on
  // an identical crest and the loop has no seam.
  const d =
    `M0 ${mid} ` +
    `C ${width * 0.25} ${mid - amplitude}, ${width * 0.75} ${mid + amplitude}, ${width} ${mid} ` +
    `C ${width * 1.25} ${mid - amplitude}, ${width * 1.75} ${mid + amplitude}, ${width * 2} ${mid} ` +
    `L ${width * 2} ${height} L 0 ${height} Z`;

  return (
    <Svg width={width * 2} height={height}>
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={from} stopOpacity={1} />
          <Stop offset="1" stopColor={to} stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <Path d={d} fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  waves: { position: 'absolute', left: 0, right: 0, bottom: '18%', overflow: 'hidden' },
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
