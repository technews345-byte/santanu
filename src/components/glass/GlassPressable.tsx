import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { motion, radius } from '../../theme/tokens';
import { useReducedMotion } from '../../theme/useReducedMotion';
import { GlassLevel, GlassSurface } from './GlassSurface';

// A soft spot of light under the fingertip, as glass catches a point light
// held close to it. One small picture, moved rather than redrawn.
const GLOW = require('../../../assets/touch-glow.png');
const GLOW_SIZE = 150;

/**
 * Glass that answers the finger the way a physical pane would.
 *
 * Two behaviours, because cards and buttons are different objects:
 *
 * - `lift` (cards): the pane rises toward you by a hair and tips a degree or
 *   two away from the point pressed, as a floating sheet does under a
 *   fingertip. A thin band of light travels across its face as the angle to
 *   the room's light changes.
 * - `press` (buttons): the control sinks — a touch smaller, a pixel lower and
 *   a shade darker — and the same band of light crosses it.
 *
 * While the finger stays down the pane follows it: the tilt and a soft spot
 * of light track the fingertip across the glass.
 *
 * Everything runs on springs driven natively: fast to depart, soft to settle,
 * and letting go halfway carries the motion on instead of snapping back. With
 * reduce-motion on, only the edge lighting up remains, so a touch is still
 * acknowledged without anything moving.
 */
export function GlassPressable({
  children,
  onPress,
  onLongPress,
  disabled,
  busy = false,
  level = 'panel',
  blur = true,
  opaque = false,
  feedback = 'press',
  style,
  contentStyle,
  borderRadius = radius.xl,
  haptic = true,
  accessibilityLabel,
  tint,
  tintBorder,
}: {
  children?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  level?: GlassLevel;
  blur?: boolean;
  opaque?: boolean;
  feedback?: 'lift' | 'press';
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  borderRadius?: number;
  haptic?: boolean;
  accessibilityLabel?: string;
  tint?: string;
  tintBorder?: string;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const press = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const tiltX = useRef(new Animated.Value(0)).current;
  const tiltY = useRef(new Animated.Value(0)).current;
  // Measured into a ref: storing the size in state re-rendered every card on
  // screen once more just after it appeared.
  const sizeRef = useRef({ width: 0, height: 0 });
  // The travelling band of light is only built once the pane is first touched
  // — most panes in a list never are.
  const [armed, setArmed] = useState(false);
  const host = useRef<View>(null);
  const pressing = useRef(false);
  // Where the pane sits on screen, measured as each touch begins, so a finger
  // moving across children of the pane is still placed on the pane itself.
  const origin = useRef<{ x: number; y: number } | null>(null);
  const glowX = useRef(new Animated.Value(-GLOW_SIZE)).current;
  const glowY = useRef(new Animated.Value(-GLOW_SIZE)).current;

  const springTo = useCallback(
    (value: Animated.Value, toValue: number) =>
      Animated.spring(value, { toValue, useNativeDriver: true, ...motion.press }),
    []
  );

  // Points the tilt and the light at a fingertip, given in screen coordinates.
  const aim = (pageX: number, pageY: number) => {
    const o = origin.current;
    const size = sizeRef.current;
    if (!o || size.width <= 0 || size.height <= 0) return;
    const lx = pageX - o.x;
    const ly = pageY - o.y;
    glowX.setValue(lx - GLOW_SIZE / 2);
    glowY.setValue(ly - GLOW_SIZE / 2);
    if (feedback === 'lift') {
      const nx = Math.max(-1, Math.min(1, (lx / size.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, (ly / size.height) * 2 - 1));
      Animated.parallel([springTo(tiltY, nx * motion.tilt), springTo(tiltX, -ny * motion.tilt)]).start();
    }
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    if (disabled) return;
    pressing.current = true;
    const size = sizeRef.current;
    if (!armed && !reduced && level !== 'row') setArmed(true);
    const moves: Animated.CompositeAnimation[] = [springTo(press, 1)];

    if (!reduced && level !== 'row') {
      if (feedback === 'lift' && size.width > 0 && size.height > 0) {
        // Where the finger landed, from -1 to 1 across each axis. The pane
        // tips away from that point: pressed on the right, the right edge
        // recedes.
        const { locationX, locationY } = event.nativeEvent;
        const nx = Math.max(-1, Math.min(1, (locationX / size.width) * 2 - 1));
        const ny = Math.max(-1, Math.min(1, (locationY / size.height) * 2 - 1));
        moves.push(springTo(tiltY, nx * motion.tilt), springTo(tiltX, -ny * motion.tilt));
      }
      sweep.setValue(0);
      moves.push(
        Animated.spring(sweep, { toValue: 1, ...motion.enter, useNativeDriver: true })
      );
    }

    Animated.parallel(moves).start();

    if (!reduced && level !== 'row') {
      const { pageX, pageY, locationX, locationY } = event.nativeEvent;
      glowX.setValue(locationX - GLOW_SIZE / 2);
      glowY.setValue(locationY - GLOW_SIZE / 2);
      host.current?.measure((_x, _y, _w, _h, px, py) => {
        if (!pressing.current || typeof px !== 'number' || typeof py !== 'number') return;
        origin.current = { x: px, y: py };
        aim(pageX, pageY);
      });
    }
  };

  const handlePressOut = () => {
    pressing.current = false;
    origin.current = null;
    Animated.parallel([springTo(press, 0), springTo(tiltX, 0), springTo(tiltY, 0)]).start();
  };

  const moving = !reduced;
  const transform =
    feedback === 'lift'
      ? [
          { perspective: 900 },
          { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, moving ? motion.pressScale : 1] }) },
          { rotateX: reduced ? '0deg' : tiltX.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) },
          { rotateY: reduced ? '0deg' : tiltY.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) },
        ]
      : [
          { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, moving ? motion.pressScale : 1] }) },
          { translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, moving ? 1 : 0] }) },
        ];

  // The travelling band: narrower than the pane and angled, so it reads as a
  // reflection passing over rather than the pane flashing.
  const paneWidth = sizeRef.current.width;
  const band = Math.max(60, paneWidth * 0.42);
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-band, paneWidth + band * 0.2] });
  const sweepOpacity = sweep.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 1, 0.8, 0] });
  const reflection = theme.mode === 'dark' ? 'rgba(235, 242, 255, 0.11)' : 'rgba(255, 255, 255, 0.55)';

  return (
    <Pressable
      ref={host}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onTouchMove={(e) => {
        if (pressing.current && !reduced && level !== 'row') aim(e.nativeEvent.pageX, e.nativeEvent.pageY);
      }}
      onLayout={(e) => {
        sizeRef.current = e.nativeEvent.layout;
      }}
      onPress={() => {
        if (haptic && Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
        onPress?.();
      }}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, busy }}
      style={style}
    >
      <Animated.View style={{ transform }}>
        <GlassSurface
          level={level}
          blur={blur}
          opaque={opaque}
          borderRadius={borderRadius}
          contentStyle={contentStyle}
          tint={tint}
          tintBorder={tintBorder}
        >
          {children}
        </GlassSurface>

        {/* Overlays sit outside the surface so they cover the whole pane,
            not just the box its content happens to fill. */}
        {(feedback === 'press' || armed) && (
        <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius }]} pointerEvents="none">
          {feedback === 'press' && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: '#000',
                  opacity: press.interpolate({ inputRange: [0, 1], outputRange: [0, theme.mode === 'dark' ? 0.18 : 0.06] }),
                },
              ]}
            />
          )}
          {armed && (
            <Animated.Image
              source={GLOW}
              fadeDuration={0}
              style={[
                styles.glow,
                {
                  opacity: press.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, theme.mode === 'dark' ? 0.22 : 0.55],
                  }),
                  transform: [{ translateX: glowX }, { translateY: glowY }],
                },
              ]}
            />
          )}
          {armed && !reduced && paneWidth > 0 && (
            <Animated.View
              style={[
                styles.band,
                { width: band, opacity: sweepOpacity, transform: [{ translateX: sweepX }, { skewX: '-18deg' }] },
              ]}
            >
              <LinearGradient
                colors={['transparent', reflection, 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          )}
        </View>
        )}

        {/* The edge brightens where it is touched — the one cue that survives
            reduce-motion, since it acknowledges the touch without travel. */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius,
              borderWidth: 1,
              borderColor: theme.mode === 'dark' ? 'rgba(235, 242, 255, 0.28)' : theme.tint,
              opacity: press,
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  band: { position: 'absolute', top: -20, bottom: -20, left: 0 },
  glow: { position: 'absolute', left: 0, top: 0, width: GLOW_SIZE, height: GLOW_SIZE },
});
