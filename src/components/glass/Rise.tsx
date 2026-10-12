import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { motion } from '../../theme/tokens';
import { useReducedMotion } from '../../theme/useReducedMotion';

/**
 * A pane arriving from depth: it starts a little behind the screen, tipped
 * back and faint, and comes forward into place on a spring — the way windows
 * settle in front of you in a spatial interface.
 *
 * Panes on a screen pass their `order` so they arrive one after another
 * rather than all at once. It runs once, when the pane first appears, and
 * entirely on the native thread, so it costs nothing after the first second.
 * With reduce-motion on, the pane is simply there.
 *
 * `flat` panes come forward without tipping back: a pane that blurs what is
 * behind it for real has to stay square to the screen, or the blur is drawn
 * for the wrong patch of background until it lands.
 */
export function Rise({
  children,
  order = 0,
  flat = false,
  style,
}: {
  children: React.ReactNode;
  order?: number;
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      t.setValue(1);
      return;
    }
    const arrive = Animated.spring(t, { toValue: 1, delay: order * 60, useNativeDriver: true, ...motion.enter });
    arrive.start();
    return () => arrive.stop();
    // Runs once: a pane arrives when it first appears, not on every change.
  }, []);

  if (reduced) return <Animated.View style={style}>{children}</Animated.View>;

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t.interpolate({ inputRange: [0, 0.55], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: flat
            ? [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
                { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
              ]
            : [
                { perspective: 1000 },
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
                { rotateX: t.interpolate({ inputRange: [0, 1], outputRange: ['12deg', '0deg'] }) },
                { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
              ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
