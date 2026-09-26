import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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
  level = 'panel',
  blur = true,
  opaque = false,
  feedback = 'lift',
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

  const springTo = useCallback(
    (value: Animated.Value, toValue: number) =>
      Animated.spring(value, { toValue, useNativeDriver: true, ...motion.press }),
    []
  );

  const handlePressIn = (event: GestureResponderEvent) => {
    if (disabled) return;
    const size = sizeRef.current;
    if (!armed && !reduced) setArmed(true);
    const moves: Animated.CompositeAnimation[] = [springTo(press, 1)];

    if (!reduced) {
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
        Animated.timing(sweep, {
          toValue: 1,
          duration: 620,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        })
      );
    }

    Animated.parallel(moves).start();
  };

  const handlePressOut = () => {
    Animated.parallel([springTo(press, 0), springTo(tiltX, 0), springTo(tiltY, 0)]).start();
  };

  const moving = !reduced;
  const transform =
    feedback === 'lift'
      ? [
          { perspective: 900 },
          { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, moving ? motion.liftScale : 1] }) },
          { rotateX: tiltX.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) },
          { rotateY: tiltY.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) },
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
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
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
      accessibilityState={{ disabled: !!disabled }}
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
          {armed && paneWidth > 0 && (
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
});
