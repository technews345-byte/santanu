import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, LayoutChangeEvent, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../theme/type';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { motion, radius, spacing } from '../../theme/tokens';
import { shade, withAlpha } from '../../theme/color';
import { useReducedMotion } from '../../theme/useReducedMotion';
import { GlassSurface } from './GlassSurface';
import { ROOM } from './Aurora';
import { ActivityIcon, BudgetIcon, HomeIcon, InsightsIcon, SettingsIcon } from './TabIcons';

const ICONS: Record<string, typeof HomeIcon> = {
  Dashboard: HomeIcon,
  Transactions: ActivityIcon,
  Budgets: BudgetIcon,
  Analytics: InsightsIcon,
  Settings: SettingsIcon,
};

/**
 * A capsule of clear glass floating above the content.
 *
 * It is see-through: the backdrop shows through it, frosted. It carries its
 * own copy of the backdrop, blurred once and lined up with the real one
 * behind it, so the bar looks like frosted glass over the scene at no cost
 * per frame. A live blur of whatever is behind would let the list scrolling
 * under it run through its labels; this keeps them clean.
 *
 * The selected tab sits on a lens: a capsule of brighter glass tinted with
 * the accent. Moving to another tab it glides across and, like a drop of
 * liquid glass, stretches a little along the way and settles back. Each icon
 * answers the finger: it dips when pressed, and pops into place (the gear
 * spins) as it becomes the selected one.
 */
export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(0);
  // Where the bar sits in the window, so its copy of the backdrop lines up.
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const shell = useRef<View>(null);
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
      <View
        ref={shell}
        style={styles.shell}
        onLayout={() => {
          shell.current?.measureInWindow((x, y) => {
            if (typeof x === 'number' && typeof y === 'number') setOrigin({ x, y });
          });
        }}
      >
        {origin && (
          <View style={[StyleSheet.absoluteFill, styles.backdropClip]} pointerEvents="none">
            <Image
              source={theme.mode === 'dark' ? ROOM.dark : ROOM.light}
              blurRadius={18}
              fadeDuration={0}
              resizeMode="cover"
              style={{ position: 'absolute', left: -origin.x, top: -origin.y, width: window.width, height: window.height }}
            />
          </View>
        )}

        <GlassSurface level="raised" blur={false} borderRadius={radius.pill}>
          <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
            {slot > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.lens,
                  {
                    width: slot - LENS_INSET * 2,
                    transform: [{ translateX }, { scaleX }, { scaleY }],
                    shadowColor: theme.tint,
                    shadowOpacity: theme.mode === 'dark' ? 0.5 : 0.22,
                  },
                ]}
              >
                <GlassSurface
                  level="control"
                  blur={false}
                  borderRadius={radius.pill}
                  style={styles.lensGlass}
                  contentStyle={styles.lensFill}
                  tint={withAlpha(theme.tint, theme.mode === 'dark' ? 0.3 : 0.16)}
                  tintBorder={withAlpha(theme.tint, theme.mode === 'dark' ? 0.55 : 0.36)}
                />
              </Animated.View>
            )}

            {state.routes.map((route, index) => {
              const focused = state.index === index;
              const { options } = descriptors[route.key];
              const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;

              return (
                <TabItem
                  key={route.key}
                  focused={focused}
                  label={label}
                  Icon={ICONS[route.name] ?? HomeIcon}
                  spin={route.name === 'Settings'}
                  onPress={() => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (focused || event.defaultPrevented) return;
                    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                    navigation.navigate(route.name);
                  }}
                />
              );
            })}
          </View>
        </GlassSurface>
      </View>
    </View>
  );
}

function TabItem({
  focused,
  label,
  Icon,
  spin,
  onPress,
}: {
  focused: boolean;
  label: string;
  Icon: typeof HomeIcon;
  spin: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  // Dips under the finger and springs back when it lifts.
  const press = useRef(new Animated.Value(0)).current;
  // 0 → 1 each time the tab becomes the selected one: a springy pop.
  const pop = useRef(new Animated.Value(1)).current;
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!focused || reduced) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 260, mass: 0.6 }).start();
  }, [focused]);

  const pressTo = (toValue: number) =>
    Animated.spring(press, { toValue, useNativeDriver: true, ...motion.press }).start();

  const scale = Animated.multiply(
    pop.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
    press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.84] })
  );
  const rotate = pop.interpolate({ inputRange: [0, 1], outputRange: [spin ? '-120deg' : '-12deg', '0deg'] });

  const iconColor = focused ? theme.tint : theme.textSecondary;
  const labelColor = focused ? (theme.mode === 'dark' ? shade(theme.tint, 0.5) : theme.tint) : theme.textSecondary;

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
      <Animated.View style={{ transform: [{ scale }, { rotate }] }}>
        <Icon color={iconColor} active={focused} size={24} />
      </Animated.View>
      <Text numberOfLines={1} style={[styles.label, { color: labelColor, fontWeight: focused ? '700' : '600' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// The lens sits this far inside its tab on each side.
const LENS_INSET = 3;

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
  },
  shell: { alignSelf: 'stretch', borderRadius: radius.pill },
  backdropClip: { borderRadius: radius.pill, overflow: 'hidden' },
  row: { flexDirection: 'row', paddingHorizontal: spacing.xs, paddingVertical: 5 },
  lens: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: spacing.xs + LENS_INSET,
    borderRadius: radius.pill,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  lensGlass: { flex: 1 },
  lensFill: { flex: 1 },
  item: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 7 },
  label: { fontSize: 10.5, letterSpacing: 0.1 },
});
