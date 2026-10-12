import React, { useEffect, useId, useRef, useState } from 'react';
import { Animated, Image, LayoutChangeEvent, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '../../theme/type';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { motion, spacing } from '../../theme/tokens';
import { withAlpha } from '../../theme/color';
import { ROOM } from './Aurora';
import { ActivityGlyph, BudgetGlyph, GLYPH_SIZE, HomeGlyph, InsightsGlyph, Orb, ORB_SIZE, SettingsGlyph } from './TabIcons';

/**
 * "Apple Inspired 3D Glass Navigation" — the tab bar to the design spec.
 *
 * Bar: 76 high, corners of 40, 16 in from each side, frosted glass (the
 * backdrop blurred 24 under a gradient at 88% in dark, 84% in light) with a
 * 1-point border, a lit top edge and an inner glow, and a shadow of 22 blur,
 * 9 down, 22%.
 *
 * Icons: 44-point circles of glossy gradient glass with white symbols.
 * Selected, an icon springs to 1.12× (0.35 s, damping 0.75), glows in its
 * colour, its label turns bold, and a 25×4 capsule in its colour sits under it.
 */
const SPEC = {
  barHeight: 76,
  barRadius: 40,
  margin: 16,
  backdropBlur: 24,
  iconLabelSpacing: 5,
  activeScale: 1.12,
  indicator: { width: 25, height: 4, radius: 2 },
  // A spring of about 0.35 s with a damping ratio of 0.75.
  spring: { stiffness: 320, damping: 27, mass: 1 },
};

type ModeColors = { active: string; glow: string; indicator: string };
type TabSpec = {
  gradient: string[];
  Glyph: typeof HomeGlyph;
  dark: ModeColors;
  light: ModeColors;
};

const TABS: Record<string, TabSpec> = {
  Dashboard: {
    gradient: ['#00C6FF', '#0055FF'],
    Glyph: HomeGlyph,
    dark: { active: '#007AFF', glow: '#008CFF', indicator: '#55CCFF' },
    light: { active: '#005BFF', glow: '#72B8FF', indicator: '#005BFF' },
  },
  Transactions: {
    gradient: ['#66758F', '#202B40'],
    Glyph: ActivityGlyph,
    // Not in the spec: graphite to match the icon.
    dark: { active: '#8FA2C8', glow: '#8FA2C8', indicator: '#B8C6E8' },
    light: { active: '#3A4766', glow: '#A9B6D3', indicator: '#3A4766' },
  },
  Budgets: {
    gradient: ['#FF53B8', '#8B35FF', '#315BFF'],
    Glyph: BudgetGlyph,
    dark: { active: '#9747FF', glow: '#B447FF', indicator: '#D77CFF' },
    light: { active: '#7035FF', glow: '#C78AFF', indicator: '#7035FF' },
  },
  Analytics: {
    gradient: ['#57F9A2', '#00B96B'],
    Glyph: InsightsGlyph,
    dark: { active: '#00D978', glow: '#00FF91', indicator: '#80FFC0' },
    light: { active: '#00A96B', glow: '#75F5BC', indicator: '#00B96B' },
  },
  Settings: {
    gradient: ['#7B8BA8', '#273247'],
    Glyph: SettingsGlyph,
    // Not in the spec: graphite to match the icon.
    dark: { active: '#9AABCB', glow: '#9AABCB', indicator: '#C3CFE6' },
    light: { active: '#3A4766', glow: '#A9B6D3', indicator: '#3A4766' },
  },
};

const MODE = {
  dark: {
    bar: ['#353D55', '#171C2D'],
    barOpacity: 0.88,
    border: '#A5B8FF',
    text: '#E8EDFF',
    inactiveText: '#C1C9DC',
  },
  light: {
    bar: ['#FFFFFF', '#F3EAFB'],
    barOpacity: 0.84,
    border: '#FFFFFF',
    text: '#303950',
    inactiveText: '#596176',
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
  const indicatorColor = (dark ? selected.dark : selected.light).indicator;

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
            scrolling under it never runs through the labels. */}
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
                dark={dark}
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
  dark,
  onPress,
}: {
  focused: boolean;
  label: string;
  tab: TabSpec;
  dark: boolean;
  onPress: () => void;
}) {
  const mode = dark ? MODE.dark : MODE.light;
  const colors = dark ? tab.dark : tab.light;
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
  const labelColor = focused ? (dark ? mode.text : colors.active) : mode.inactiveText;
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
          <Halo color={colors.glow} />
        </Animated.View>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Orb gradient={tab.gradient} />
          <View style={styles.glyph}>
            <Glyph hole={tab.gradient[tab.gradient.length - 1]} />
          </View>
        </Animated.View>
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: labelColor, fontWeight: focused ? '700' : '500' }]}>
        {label}
      </Text>
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
  row: { flex: 1, flexDirection: 'row', paddingTop: 7 },
  item: { flex: 1, alignItems: 'center' },
  stage: { width: HALO_SIZE, height: ORB_SIZE, alignItems: 'center' },
  halo: { position: 'absolute', top: ORB_SIZE / 2 - HALO_SIZE / 2, left: 0 },
  glyph: {
    position: 'absolute',
    top: (ORB_SIZE - GLYPH_SIZE) / 2,
    left: (ORB_SIZE - GLYPH_SIZE) / 2,
  },
  label: { fontSize: 11, lineHeight: 13, letterSpacing: 0.1, marginTop: SPEC.iconLabelSpacing },
  indicator: {
    position: 'absolute',
    bottom: 1,
    width: SPEC.indicator.width,
    height: SPEC.indicator.height,
    borderRadius: SPEC.indicator.radius,
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
