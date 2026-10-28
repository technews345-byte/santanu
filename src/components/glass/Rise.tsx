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
    const arrive = reduced
      ? Animated.timing(t, { toValue: 1, duration: 200, useNativeDriver: true })
      : Animated.spring(t, { toValue: 1, delay: order * 60, useNativeDriver: true, ...motion.enter });
    arrive.start();
    return () => arrive.stop();
  }, [reduced, order, t]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t.interpolate({ inputRange: [0, 0.55], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ translateY: reduced ? 0 : t.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
