import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../theme/useReducedMotion';
import { skin } from '../theme/skin';

const SPLASH = require('../../assets/raahi-splash.jpg');
const ART_WIDTH = 864;
const ART_HEIGHT = 1536;
// The supplied artwork has its logo and tagline centered in this portrait.
const TAGLINE_BOTTOM = 910;

export function BrandSplash({ ready, onFirstFrame, onFinish }: {
  ready: boolean; onFirstFrame: () => void; onFinish: () => void;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [presented, setPresented] = useState(false);
  const [minimumTimeMet, setMinimumTimeMet] = useState(false);
  const announced = useRef(false);
  const onFirstFrameRef = useRef(onFirstFrame);
  const finishRef = useRef(onFinish);
  onFirstFrameRef.current = onFirstFrame;
  finishRef.current = onFinish;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1.025)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Hide the native splash only after the correctly sized image has loaded.
  useEffect(() => {
    if (!frame || !imageLoaded || announced.current) return;
    announced.current = true;
    setPresented(true);
    onFirstFrameRef.current();
  }, [frame, imageLoaded]);

  useEffect(() => {
    if (!presented) return;
    const timer = setTimeout(() => setMinimumTimeMet(true), 650);
    return () => clearTimeout(timer);
  }, [presented]);

  useEffect(() => {
    if (!presented) return;
    if (reduced) { scale.setValue(1); pulse.setValue(0.65); return; }
    const intro = Animated.spring(scale, { toValue: 1, ...skin.spring, useNativeDriver: true });
    const loading = Animated.loop(Animated.sequence([
      Animated.spring(pulse, { toValue: 1, ...skin.spring, useNativeDriver: true, isInteraction: false }),
      Animated.spring(pulse, { toValue: 0, ...skin.spring, useNativeDriver: true, isInteraction: false }),
    ]));
    intro.start();
    loading.start();
    return () => { intro.stop(); loading.stop(); };
  }, [presented, reduced, scale, pulse]);

  useEffect(() => {
    if (!ready || !presented || !minimumTimeMet) return;
    const animation = reduced
      ? Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true })
      : Animated.spring(opacity, { toValue: 0, useNativeDriver: true, ...skin.spring, overshootClamping: true });
    animation.start(({ finished }) => { if (finished) finishRef.current(); });
    return () => animation.stop();
  }, [ready, presented, minimumTimeMet, reduced, opacity]);

  const layout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setFrame(old => old?.width === width && old.height === height ? old : { width, height });
  };
  // Match resizeMode="cover" so the indicator stays below the tagline on
  // narrower phones and wider tablets without covering the logo.
  const imageScale = frame ? Math.max(frame.width / ART_WIDTH, frame.height / ART_HEIGHT) : 1;
  const indicatorTop = frame ? Math.min(frame.height - 32, (frame.height - ART_HEIGHT * imageScale) / 2 + TAGLINE_BOTTOM * imageScale + 20) : 0;
  return <Animated.View onLayout={layout} accessible accessibilityRole="progressbar" accessibilityLabel="Loading Raahi"
    style={[styles.fill, { backgroundColor: theme.bg, opacity }]}>
    {frame && <Animated.Image source={SPLASH} resizeMode="cover" onLoadEnd={() => setImageLoaded(true)}
      style={[styles.art, { width: frame.width, height: frame.height, transform: [{ scale }] }]} />}
    {presented && <View style={[styles.loading, { top: indicatorTop }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map(index => <Animated.View key={index} style={[styles.dot, {
        opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: index === 0 ? [0.95, 0.35, 0.5] : index === 1 ? [0.45, 0.95, 0.45] : [0.5, 0.35, 0.95] }),
      }]} />)}
    </View>}
  </Animated.View>;
}
const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, overflow: 'hidden' },
  art: { position: 'absolute', top: 0, left: 0 },
  loading: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#EAF7FF' },
});
