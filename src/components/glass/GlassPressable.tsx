import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { motion, radius } from '../../theme/tokens';
import { GlassLevel, GlassSurface } from './GlassSurface';

/**
 * Glass that answers the finger.
 *
 * Pressing sinks the surface very slightly and lifts a soft highlight out of
 * the point touched, rather than washing the whole thing with a ripple. Both
 * run on springs, so letting go part-way through carries the movement on
 * instead of snapping it back, and both are driven natively so a scrolling
 * list never stutters because of them.
 */
export function GlassPressable({
  children,
  onPress,
  onLongPress,
  disabled,
  level = 'panel',
  blur = true,
  opaque = false,
  style,
  contentStyle,
  borderRadius = radius.xl,
  haptic = true,
}: {
  children?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  level?: GlassLevel;
  blur?: boolean;
  opaque?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  borderRadius?: number;
  haptic?: boolean;
}) {
  const { theme } = useTheme();
  const press = useRef(new Animated.Value(0)).current;
  const [touch, setTouch] = useState({ x: 0.5, y: 0.5 });
  const [size, setSize] = useState({ width: 0, height: 0 });

  const spring = useCallback(
    (toValue: number) => {
      Animated.spring(press, { toValue, useNativeDriver: true, ...motion.press }).start();
    },
    [press]
  );

  const handlePressIn = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    if (size.width > 0 && size.height > 0) {
      setTouch({ x: locationX / size.width, y: locationY / size.height });
    }
    spring(1);
  };

  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, motion.pressScale] });
  const glow = press.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const edge = press.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Pressable
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={() => spring(0)}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      onPress={() => {
        if (haptic && Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <GlassSurface level={level} blur={blur} opaque={opaque} borderRadius={borderRadius} contentStyle={contentStyle}>
          {children}
        </GlassSurface>

        {/* Overlays sit outside the surface so they cover the whole pane, not
            just the box its content happens to fill. */}
        <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius }]} pointerEvents="none">
          {/* Anchored where the finger landed, so the glass looks lit from
              that point rather than uniformly brightened. */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: glow,
                backgroundColor: theme.glassSheen,
                transform: [
                  { translateX: (touch.x - 0.5) * size.width * 0.35 },
                  { translateY: (touch.y - 0.5) * size.height * 0.35 },
                ],
              },
            ]}
          />
        </View>

        {/* The lit rim: the edge of real glass brightens where it is pushed. */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { opacity: edge, borderRadius, borderWidth: 1.4, borderColor: theme.tint },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
