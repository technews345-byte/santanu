import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
 * The selected destination is its own small pane — brighter glass tinted
 * with the accent, lit on its edge and glowing faintly — that glides between
 * tabs. The icon being left settles as the one being entered rises, so the two
 * trade weight rather than one blinking off and another on.
 */
export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const travel = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.spring(travel, {
      toValue: state.index,
      useNativeDriver: true,
      ...motion.glide,
    }).start();
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

  return (
    <View
      style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      pointerEvents="box-none"
    >
      <GlassSurface level="raised" opaque borderRadius={radius.xl} style={styles.bar}>
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
                  width: slot,
                  transform: [{ translateX }],
                  shadowColor: theme.tint,
                  shadowOpacity: theme.mode === 'dark' ? 0.45 : 0.18,
                },
              ]}
            >
              <GlassSurface
                level="control"
                blur={false}
                borderRadius={radius.lg}
                style={styles.pillGlass}
                contentStyle={styles.pillFill}
                tint={withAlpha(theme.tint, theme.mode === 'dark' ? 0.2 : 0.1)}
                tintBorder={withAlpha(theme.tint, theme.mode === 'dark' ? 0.4 : 0.28)}
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

  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const rise = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  // The active icon is lifted toward white on dark, so it reads as lit by the
  // pane beneath it rather than as the accent printed on glass.
  const color = focused ? (theme.mode === 'dark' ? shade(theme.tint, 0.45) : theme.tint) : theme.textTertiary;

  return (
    <Pressable onPress={onPress} style={styles.item} hitSlop={4}>
      <Animated.View style={{ transform: [{ scale }, { translateY: rise }] }}>
        {icon?.({ focused, color, size: 22 })}
      </Animated.View>
      <Text numberOfLines={1} style={[styles.label, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
  },
  bar: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', paddingHorizontal: spacing.xs, paddingVertical: 5 },
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: spacing.xs,
    borderRadius: radius.lg,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  pillGlass: { flex: 1 },
  pillFill: { flex: 1 },
  item: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6 },
  label: { fontSize: 10, fontWeight: '700' },
});
