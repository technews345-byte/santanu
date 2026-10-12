import React, { useEffect, useId, useRef, useState } from 'react';
import { Animated, Image, LayoutChangeEvent, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { Text } from '../../theme/type';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { motion, radius, spacing } from '../../theme/tokens';
import { useReducedMotion } from '../../theme/useReducedMotion';
import { GlassSurface } from './GlassSurface';
import { ROOM } from './Aurora';
import {
  ActivityGlyph,
  BudgetGlyph,
  GLYPH_SIZE,
  HomeGlyph,
  InsightsGlyph,
  Orb,
  ORB_SIZE,
  OrbColors,
  SettingsGlyph,
} from './TabIcons';

// Bright, luminous glass, as in the reference design: vivid colour with a
// pale lit spot, and edges that stay in the colour rather than going dark.
const BLUE: OrbColors = { light: '#C2EBFF', base: '#2F9BFF', edge: '#1569F5', glow: '#3AA0FF' };
const VIOLET: OrbColors = { light: '#FFD0F6', base: '#C468FF', edge: '#6F5CFF', glow: '#B96CFF' };
const GREEN: OrbColors = { light: '#C2FFD2', base: '#36D978', edge: '#17A84D', glow: '#36D978' };
const GRAPHITE_DARK: OrbColors = { light: '#B9C1D1', base: '#6A7386', edge: '#454C5C', glow: '#9AA6C0' };
const GRAPHITE_LIGHT: OrbColors = { light: '#FFFFFF', base: '#CDD3DF', edge: '#9AA3B6', glow: '#8C98B5', glyph: '#4E5669' };

type TabLook = { colors: (dark: boolean) => OrbColors; Glyph: typeof HomeGlyph; spin?: boolean };

const TABS: Record<string, TabLook> = {
  Dashboard: { colors: () => BLUE, Glyph: HomeGlyph },
  Transactions: { colors: (dark) => (dark ? GRAPHITE_DARK : GRAPHITE_LIGHT), Glyph: ActivityGlyph },
  Budgets: { colors: () => VIOLET, Glyph: BudgetGlyph },
  Analytics: { colors: () => GREEN, Glyph: InsightsGlyph },
  Settings: { colors: (dark) => (dark ? GRAPHITE_DARK : GRAPHITE_LIGHT), Glyph: SettingsGlyph, spin: true },
};

/**
 * A capsule of clear glass floating above the content, holding a row of
 * glossy coloured orbs.
 *
 * It is see-through: the backdrop shows through it, frosted. It carries its
 * own copy of the backdrop, blurred once and lined up with the real one
 * behind it, so the bar looks like frosted glass over the scene at no cost
 * per frame. A live blur of whatever is behind would let the list scrolling
 * under it run through its labels; this keeps them clean.
 *
 * Each tab is an orb of its own colour. The selected one grows a little and
 * glows, its label turns bold, and a short bar of its colour sits beneath it,
 * gliding to the next tab as you move. Orbs dip under the finger and pop
 * into place when chosen — the gear spins in — and the glow flares as it
 * lights up.
 */
export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const dark = theme.mode === 'dark';
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(0);
  // Where the bar sits in the window, so its copy of the backdrop lines up.
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const shell = useRef<View>(null);
  const travel = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.spring(travel, { toValue: state.index, useNativeDriver: true, ...motion.glide }).start();
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
  const selected = TABS[state.routes[state.index]?.name] ?? TABS.Dashboard;

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
              source={dark ? ROOM.dark : ROOM.light}
              blurRadius={18}
              fadeDuration={0}
              resizeMode="cover"
              style={{ position: 'absolute', left: -origin.x, top: -origin.y, width: window.width, height: window.height }}
            />
          </View>
        )}

        <GlassSurface level="raised" blur={false} borderRadius={radius.pill}>
          <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
            {state.routes.map((route, index) => {
              const focused = state.index === index;
              const { options } = descriptors[route.key];
              const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;
              const look = TABS[route.name] ?? TABS.Dashboard;

              return (
                <TabItem
                  key={route.key}
                  focused={focused}
                  label={label}
                  colors={look.colors(dark)}
                  Glyph={look.Glyph}
                  spin={!!look.spin}
                  onPress={() => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (focused || event.defaultPrevented) return;
                    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                    navigation.navigate(route.name);
                  }}
                />
              );
            })}

            {slot > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.indicator,
                  {
                    left: spacing.xs + slot / 2 - INDICATOR_WIDTH / 2,
                    backgroundColor: selected.colors(dark).glow,
                    shadowColor: selected.colors(dark).glow,
                    transform: [{ translateX }],
                  },
                ]}
              />
            )}
          </View>
        </GlassSurface>
      </View>
    </View>
  );
}

function TabItem({
  focused,
  label,
  colors,
  Glyph,
  spin,
  onPress,
}: {
  focused: boolean;
  label: string;
  colors: OrbColors;
  Glyph: typeof HomeGlyph;
  spin: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const dark = theme.mode === 'dark';
  const reduced = useReducedMotion();
  // Dips under the finger and springs back when it lifts.
  const press = useRef(new Animated.Value(0)).current;
  // 0 → 1 each time the tab becomes the selected one: a springy pop.
  const pop = useRef(new Animated.Value(1)).current;
  // How selected the tab is, eased: grows the orb and lights its halo.
  const chosen = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const mounted = useRef(false);

  useEffect(() => {
    Animated.spring(chosen, { toValue: focused ? 1 : 0, useNativeDriver: true, ...motion.glide }).start();
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
    Animated.multiply(
      pop.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
      press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] })
    ),
    chosen.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.04] })
  );
  const spinGlyph = pop.interpolate({ inputRange: [0, 1], outputRange: [spin ? '-120deg' : '-14deg', '0deg'] });
  // The glow flares as the orb is chosen, then settles.
  const haloScale = pop.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1] });

  const labelColor = focused
    ? dark
      ? '#FFFFFF'
      : theme.tint
    : dark
      ? 'rgba(236, 239, 246, 0.78)'
      : theme.textSecondary;

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
      <View style={styles.stage}>
        <Animated.View style={[styles.halo, { opacity: chosen, transform: [{ scale: haloScale }] }]} pointerEvents="none">
          <Halo color={colors.glow} />
        </Animated.View>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Orb colors={colors} />
          <Animated.View style={[styles.glyph, { transform: [{ rotate: spinGlyph }] }]}>
            <Glyph color={colors.glyph ?? '#FFFFFF'} hole={colors.base} />
          </Animated.View>
        </Animated.View>
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: labelColor, fontWeight: focused ? '700' : '600' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The selected orb's glow: its own colour spilling softly onto the glass. */
const Halo = React.memo(function Halo({ color }: { color: string }) {
  const id = 'halo' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={HALO_SIZE} height={HALO_SIZE} viewBox="0 0 64 64">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0.55" stopColor={color} stopOpacity={0.32} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={32} cy={32} rx={32} ry={32} fill={`url(#${id})`} />
    </Svg>
  );
});

const HALO_SIZE = 64;
const STAGE_HEIGHT = 46;
/** The bar's height above the phone's own bottom inset, for things that float above it. */
export const TAB_BAR_HEIGHT = 80;
const INDICATOR_WIDTH = 22;

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  shell: { alignSelf: 'stretch', borderRadius: radius.pill },
  backdropClip: { borderRadius: radius.pill, overflow: 'hidden' },
  row: { flexDirection: 'row', paddingHorizontal: spacing.xs, paddingTop: 7, paddingBottom: 13, height: TAB_BAR_HEIGHT },
  item: { flex: 1, alignItems: 'center' },
  stage: { width: HALO_SIZE, height: STAGE_HEIGHT, alignItems: 'center' },
  halo: { position: 'absolute', top: ORB_SIZE / 2 - HALO_SIZE / 2 + 1, left: 0 },
  glyph: {
    position: 'absolute',
    top: (ORB_SIZE - GLYPH_SIZE) / 2,
    left: (ORB_SIZE - GLYPH_SIZE) / 2,
  },
  label: { fontSize: 11, letterSpacing: 0.1, marginTop: -1 },
  indicator: {
    position: 'absolute',
    bottom: 6,
    width: INDICATOR_WIDTH,
    height: 4,
    borderRadius: 2,
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
