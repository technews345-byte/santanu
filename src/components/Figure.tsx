import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleProp, TextStyle } from 'react-native';
import { typeface } from '../theme/type';
import { useReducedMotion } from '../theme/useReducedMotion';

/**
 * A number that travels to its new value instead of being replaced.
 *
 * When a figure changes it counts from where it was to where it is going,
 * decelerating into place, and brightens for a moment as it lands — so a
 * balance updating after a save is something you see happen rather than a
 * digit that silently differs. On first appearance it fades up into place.
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
  // Figures start at their value. Counting up from zero as a screen opened
  // meant a re-render per figure per frame while the screen itself was
  // moving in; instead they fade and settle into place on the native driver.
  const count = useRef(new Animated.Value(value)).current;
  const glow = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(reduced ? 0 : 6)).current;
  const [shown, setShown] = useState(value);
  const first = useRef(true);
  const lastText = useRef(format(value));
  const lastAt = useRef(0);
  const formatRef = useRef(format);
  formatRef.current = format;

  // Only a change in what the figure says reaches React, and at most thirty
  // times a second: the eye reads a count as smooth well below the screen's
  // rate, and each update is a text layout. The final value is set when the
  // count ends, so it always lands exactly.
  useEffect(() => {
    const id = count.addListener(({ value: v }) => {
      const now = Date.now();
      if (now - lastAt.current < 32) return;
      const text = formatRef.current(v);
      if (text === lastText.current) return;
      lastAt.current = now;
      lastText.current = text;
      setShown(v);
    });
    return () => count.removeListener(id);
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!reduced) {
        Animated.parallel([
          Animated.timing(glow, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.spring(lift, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 170 }),
        ]).start();
      }
      return;
    }
    if (reduced) {
      count.setValue(value);
      setShown(value);
      return;
    }
    // A change counts from where the figure was to where it is going, and
    // lands with a brief lift in brightness and size.
    Animated.timing(count, {
      toValue: value,
      duration,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      // Drives text content, which only the JS side can change.
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      lastText.current = formatRef.current(value);
      setShown(value);
    });
    glow.setValue(0.72);
    scale.setValue(1.025);
    Animated.parallel([
      Animated.timing(glow, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }),
    ]).start();
  }, [value, reduced]);

  return (
    <Animated.Text
      style={[style, typeface(style), { opacity: glow, transform: [{ translateY: lift }, { scale }] }]}
      accessibilityLabel={hidden ? 'Hidden' : format(value)}
      numberOfLines={fit ? 1 : undefined}
      // Web has no shrink-to-fit and would pass the prop through to the DOM.
      {...(fit && Platform.OS !== 'web' ? { adjustsFontSizeToFit: true, minimumFontScale: 0.6 } : null)}
    >
      {hidden ? mask : format(shown)}
    </Animated.Text>
  );
}
