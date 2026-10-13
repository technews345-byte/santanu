import React, { useEffect, useId, useRef, useState } from 'react';
import { Animated, Image, LayoutChangeEvent, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { motion, spacing } from '../../theme/tokens';
import { withAlpha } from '../../theme/color';
import { ROOM } from './Aurora';
import { ActivityGlyph, BudgetGlyph, GLYPH_SIZE, HomeGlyph, InsightsGlyph, Orb, ORB_SIZE, SettingsGlyph } from './TabIcons';

/**
 * The tab bar: a capsule of frosted glass (the backdrop blurred 24 under a
 * gradient at 88% in dark, 84% in light) with a 1-point border, a lit top
 * edge, an inner glow and a soft shadow, holding a row of icons without
 * labels — each tab is named for screen readers instead.
 *
 * Icons are round, in the style of iOS 27. Selected, an icon springs to 1.12×
 * (0.35 s, damping 0.75), glows softly in its colour, and a 25×4 capsule in
 * its colour sits under it.
 */
const SPEC = {
  barHeight: 66,
  barRadius: 34,
  margin: 16,
  backdropBlur: 24,
  activeScale: 1.12,
  indicator: { width: 25, height: 4, radius: 2 },
  // A spring of about 0.35 s with a damping ratio of 0.75.
  spring: { stiffness: 320, damping: 27, mass: 1 },
};

type TabSpec = {
  gradient: string[];
  Glyph: typeof HomeGlyph;
  /** The glow when selected, and the indicator under the icon. */
  accent: string;
};

const TABS: Record<string, TabSpec> = {
  Dashboard: { gradient: ['#45ADFF', '#0A6CFF'], Glyph: HomeGlyph, accent: '#2F8CFF' },
  Transactions: { gradient: ['#FFFFFF', '#E3E7EE'], Glyph: ActivityGlyph, accent: '#8E9AB3' },
  Budgets: { gradient: ['#FF8A8A', '#FF4757'], Glyph: BudgetGlyph, accent: '#FF5A64' },
  Analytics: { gradient: ['#5FE37E', '#1FAE4B'], Glyph: InsightsGlyph, accent: '#34C759' },
  Settings: { gradient: ['#B9BEC8', '#7E848F'], Glyph: SettingsGlyph, accent: '#9AA0AB' },
};

const MODE = {
  dark: {
    bar: ['#353D55', '#171C2D'],
    barOpacity: 0.88,
    border: '#A5B8FF',
  },
  light: {
    bar: ['#FFFFFF', '#F3EAFB'],
    barOpacity: 0.84,
    border: '#FFFFFF',
  },
};

/** The bar's height above the phone's own bottom inset, for things that float above it. */
export const TAB_BAR_HEIGHT = SPEC.barHeight;

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const dark = theme.mode === 'dark';
  const mode = dark ? MODE.dark : MODE.light;
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(0);
  // Where the bar sits in the window, so its copy of the backdrop lines up.
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const shell = useRef<View>(null);
  const travel = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.spring(travel, { toValue: state.index, useNativeDriver: true, ...SPEC.spring }).start();
  }, [state.index]);

  const count = state.routes.length;
  const slot = width > 0 ? width / count : 0;
  const translateX =
    slot > 0
      ? travel.interpolate({
          inputRange: state.routes.map((_, i) => i),
          outputRange: state.routes.map((_, i) => i * slot),
          extrapolate: 'clamp',
        })
      : 0;
  const selected = TABS[state.routes[state.index]?.name] ?? TABS.Dashboard;
  const indicatorColor = selected.accent;

  return (
    <View
      style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      pointerEvents="box-none"
    >
      <View
        ref={shell}
        style={[styles.shell, { shadowOpacity: 0.22 }]}
        onLayout={() => {
          shell.current?.measureInWindow((x, y) => {
            if (typeof x === 'number' && typeof y === 'number') setOrigin({ x, y });
          });
        }}
      >
        {/* Frosted glass: the backdrop seen through the bar, blurred. The bar
            carries its own copy of the backdrop, blurred once and lined up
            with the real one, so it costs nothing per frame and the list
            scrolling under it never shows through. */}
        <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
          {origin && (
            <Image
              source={dark ? ROOM.dark : ROOM.light}
              blurRadius={SPEC.backdropBlur}
              fadeDuration={0}
              resizeMode="cover"
              style={{ position: 'absolute', left: -origin.x, top: -origin.y, width: window.width, height: window.height }}
            />
          )}
          <LinearGradient
            colors={mode.bar as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[StyleSheet.absoluteFill, { opacity: mode.barOpacity }]}
          />
          {/* Inner glow along the top, and the lit top edge */}
          <LinearGradient
            colors={[withAlpha('#FFFFFF', dark ? 0.1 : 0.55), 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['transparent', withAlpha('#FFFFFF', dark ? 0.55 : 1), 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.edge}
          />
        </View>
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.border, { borderColor: withAlpha(mode.border, dark ? 0.45 : 0.95) }]}
        />

        <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const { options } = descriptors[route.key];
            const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;
            const tab = TABS[route.name] ?? TABS.Dashboard;

            return (
              <TabItem
                key={route.key}
                focused={focused}
                label={label}
                tab={tab}
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
                  left: slot / 2 - SPEC.indicator.width / 2,
                  backgroundColor: indicatorColor,
                  shadowColor: indicatorColor,
                  transform: [{ translateX }],
                },
              ]}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function TabItem({
  focused,
  label,
  tab,
  onPress,
}: {
  focused: boolean;
  label: string;
  tab: TabSpec;
  onPress: () => void;
}) {
  // Dips under the finger and springs back when it lifts.
  const press = useRef(new Animated.Value(0)).current;
  // How selected the tab is: scales the icon and lights its glow.
  const chosen = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(chosen, { toValue: focused ? 1 : 0, useNativeDriver: true, ...SPEC.spring }).start();
  }, [focused]);

  const pressTo = (toValue: number) =>
    Animated.spring(press, { toValue, useNativeDriver: true, ...motion.press }).start();

  const scale = Animated.multiply(
    chosen.interpolate({ inputRange: [0, 1], outputRange: [1, SPEC.activeScale] }),
    press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] })
  );
  const { Glyph } = tab;

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
        <Animated.View style={[styles.halo, { opacity: chosen, transform: [{ scale }] }]} pointerEvents="none">
          <Halo color={tab.accent} />
        </Animated.View>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Orb gradient={tab.gradient} />
          <View style={styles.glyph}>
            <Glyph hole={tab.gradient[tab.gradient.length - 1]} />
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

/** The selected icon's glow: its colour spilling softly onto the glass. */
const Halo = React.memo(function Halo({ color }: { color: string }) {
  const id = 'halo' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={HALO_SIZE} height={HALO_SIZE} viewBox="0 0 64 64">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0.6" stopColor={color} stopOpacity={0.4} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={32} cy={32} rx={32} ry={32} fill={`url(#${id})`} />
    </Svg>
  );
});

const HALO_SIZE = 62;

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPEC.margin,
  },
  shell: {
    alignSelf: 'stretch',
    height: SPEC.barHeight,
    borderRadius: SPEC.barRadius,
    shadowColor: '#000',
    shadowRadius: 22 / 2,
    shadowOffset: { width: 0, height: 9 },
  },
  clip: { borderRadius: SPEC.barRadius, overflow: 'hidden' },
  border: { borderRadius: SPEC.barRadius, borderWidth: 1 },
  edge: { position: 'absolute', top: 0, left: '12%', right: '12%', height: 1 },
  row: { flex: 1, flexDirection: 'row', paddingTop: 8 },
  item: { flex: 1, alignItems: 'center' },
  stage: { width: HALO_SIZE, height: ORB_SIZE, alignItems: 'center' },
  halo: { position: 'absolute', top: ORB_SIZE / 2 - HALO_SIZE / 2, left: 0 },
  glyph: {
    position: 'absolute',
    top: (ORB_SIZE - GLYPH_SIZE) / 2,
    left: (ORB_SIZE - GLYPH_SIZE) / 2,
  },
  indicator: {
    position: 'absolute',
    bottom: 4,
    width: SPEC.indicator.width,
    height: SPEC.indicator.height,
    borderRadius: SPEC.indicator.radius,
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
