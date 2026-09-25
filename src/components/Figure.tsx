import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleProp, TextStyle } from 'react-native';
import { useReducedMotion } from '../theme/useReducedMotion';

/**
 * A number that travels to its new value instead of being replaced.
 *
 * When a figure changes it counts from where it was to where it is going,
 * decelerating into place, and brightens for a moment as it lands — so a
 * balance updating after a save is something you see happen rather than a
 * digit that silently differs. On first appearance it counts up from zero.
 *
 * Used for the handful of headline figures on a screen, never for every row
 * in a list, where movement would stop being information.
 */
export function Figure({
  value,
  format,
  style,
  duration = 720,
  hidden,
  mask = '••••••',
  fit,
}: {
  value: number;
  format: (n: number) => string;
  style?: StyleProp<TextStyle>;
  duration?: number;
  /** Show a mask instead of the figure (the balance privacy toggle). */
  hidden?: boolean;
  mask?: string;
  /** Shrink to one line rather than wrap — for a figure that could run long. */
  fit?: boolean;
}) {
  const reduced = useReducedMotion();
  const count = useRef(new Animated.Value(reduced ? value : 0)).current;
  const glow = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState(reduced ? value : 0);
  const first = useRef(true);

  useEffect(() => {
    const id = count.addListener(({ value: v }) => setShown(v));
    return () => count.removeListener(id);
  }, []);

  useEffect(() => {
    if (reduced) {
      count.setValue(value);
      setShown(value);
      return;
    }
    Animated.timing(count, {
      toValue: value,
      duration,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      // Drives text content, which only the JS side can change.
      useNativeDriver: false,
    }).start(({ finished }) => finished && setShown(value));

    // A change after the first arrival lands with a brief lift in brightness
    // and size; the first count-up is movement enough on its own.
    if (!first.current) {
      glow.setValue(0.72);
      scale.setValue(1.025);
      Animated.parallel([
        Animated.timing(glow, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }),
      ]).start();
    }
    first.current = false;
  }, [value, reduced]);

  return (
    <Animated.Text
      style={[style, { opacity: glow, transform: [{ scale }] }]}
      accessibilityLabel={hidden ? 'Hidden' : format(value)}
      numberOfLines={fit ? 1 : undefined}
      // Web has no shrink-to-fit and would pass the prop through to the DOM.
      {...(fit && Platform.OS !== 'web' ? { adjustsFontSizeToFit: true, minimumFontScale: 0.6 } : null)}
    >
      {hidden ? mask : format(shown)}
    </Animated.Text>
  );
}
