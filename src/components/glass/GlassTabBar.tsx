import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../theme/type';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { fontSizes, motion, radius, spacing } from '../../theme/tokens';
import { shade, withAlpha } from '../../theme/color';
import { GlassSurface } from './GlassSurface';

/**
 * A thin shelf of glass floating above the content, not a bar sealing the
 * bottom of the screen.
 *
 * It keeps the edge light and depth of glass but is backed solid: a
 * see-through shelf let the list run visibly through its labels, and a
 * control that is hard to read is not worth the effect.
 *
 * The selected destination sits under a lens: a rounded pane of brighter
 * glass, tinted with the accent and lit on its edge, inset evenly inside its
 * tab. Moving to another tab it glides across and, like a drop of liquid
 * glass, stretches a little along the way and settles back into shape. The
 * icon being left settles as the one being entered rises, so the two trade
 * weight rather than one blinking off and another on.
 */
export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const travel = useRef(new Animated.Value(state.index)).current;
  // 0 at rest, 1 at full stretch mid-glide.
  const stretch = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    const glide = Animated.spring(travel, { toValue: state.index, useNativeDriver: true, ...motion.glide });
    if (first.current) {
      first.current = false;
      glide.start();
      return;
    }
    Animated.parallel([
      glide,
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 0, useNativeDriver: true, damping: 14, stiffness: 220, mass: 0.8 }),
      ]),
    ]).start();
  }, [state.index]);

  const count = state.routes.length;
  const slot = width > 0 ? (width - spacing.xs * 2) / count : 0;
  const translateX =
    slot > 0
      ? travel.interpolate({
          inputRange: state.routes.map((_, i) => i),
          outputRange: state.routes.map((_, i) => i * slot),
          extrapolate: 'clamp',
        })
      : 0;
  const scaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const scaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });

  return (
    <View
      style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      pointerEvents="box-none"
    >
      <GlassSurface level="raised" opaque borderRadius={radius.pill} style={styles.bar}>
        <View
          style={styles.row}
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        >
          {slot > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pill,
                {
                  width: slot - LENS_INSET * 2,
                  transform: [{ translateX }, { scaleX }, { scaleY }],
                  shadowColor: theme.tint,
                  shadowOpacity: theme.mode === 'dark' ? 0.45 : 0.18,
                },
              ]}
            >
              <GlassSurface
                level="control"
                blur={false}
                borderRadius={LENS_RADIUS}
                style={styles.pillGlass}
                contentStyle={styles.pillFill}
                tint={withAlpha(theme.tint, theme.mode === 'dark' ? 0.26 : 0.13)}
                tintBorder={withAlpha(theme.tint, theme.mode === 'dark' ? 0.5 : 0.32)}
              />
            </Animated.View>
          )}

          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const { options } = descriptors[route.key];
            const label =
              typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;

            return (
              <TabItem
                key={route.key}
                focused={focused}
                label={label}
                icon={options.tabBarIcon}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (focused || event.defaultPrevented) return;
                  if (Platform.OS !== 'web') {
                    Haptics.selectionAsync().catch(() => {});
                  }
                  navigation.navigate(route.name);
                }}
              />
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

function TabItem({
  focused,
  label,
  icon,
  onPress,
}: {
  focused: boolean;
  label: string;
  icon?: (props: { focused: boolean; color: string; size: number }) => React.ReactNode;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(lift, { toValue: focused ? 1 : 0, useNativeDriver: true, ...motion.glide }).start();
  }, [focused]);

  // Dips under the finger and springs back when it lifts.
  const press = useRef(new Animated.Value(0)).current;
  const pressTo = (toValue: number) =>
    Animated.spring(press, { toValue, useNativeDriver: true, ...motion.press }).start();

  const scale = Animated.multiply(
    lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }),
    press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] })
  );
  const rise = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -1] });
  // The active icon is lifted toward white on dark, so it reads as lit by the
  // lens beneath it rather than as the accent printed on glass.
  const color = focused ? (theme.mode === 'dark' ? shade(theme.tint, 0.5) : theme.tint) : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => pressTo(1)}
      onPressOut={() => pressTo(0)}
      style={styles.item}
      hitSlop={4}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.itemInner, { transform: [{ scale }, { translateY: rise }] }]}>
        {icon?.({ focused, color, size: 23 })}
        <Text numberOfLines={1} style={[styles.label, { color, fontWeight: focused ? '700' : '600' }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// The lens sits this far inside its tab on each side, and is rounded to suit
// a tab-sized pane rather than drawn as a full capsule, which on a tall,
// narrow tab came out as an egg.
const LENS_INSET = 3;
const LENS_RADIUS = 20;

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
  },
  bar: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', paddingHorizontal: spacing.xs, paddingVertical: 6 },
  pill: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: spacing.xs + LENS_INSET,
    borderRadius: LENS_RADIUS,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  pillGlass: { flex: 1 },
  pillFill: { flex: 1 },
  item: { flex: 1, alignItems: 'center', paddingVertical: 7 },
  itemInner: { alignItems: 'center', gap: 3 },
  label: { fontSize: 10.5, letterSpacing: 0.1 },
});
