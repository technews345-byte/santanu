import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { fontSizes, motion, radius, spacing } from '../../theme/tokens';
import { GlassSurface } from './GlassSurface';

/**
 * A bar that floats above the content rather than sealing the bottom of the
 * screen.
 *
 * It keeps the tint, sheen and lit border of glass but is backed solid: a
 * see-through bar let the list run visibly through its labels, and a control
 * that is hard to read is not worth the effect.
 *
 * The selected marker is one pill that travels between destinations. The icon
 * of the destination being left shrinks as the one being entered grows, so
 * the two swap weight rather than one blinking off and another on.
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
                  backgroundColor: theme.tintMuted,
                  borderColor: theme.glassBorder,
                },
              ]}
            />
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
  const color = focused ? theme.tint : theme.textTertiary;

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
  row: { flexDirection: 'row', paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  pill: {
    position: 'absolute',
    top: spacing.xxs,
    bottom: spacing.xxs,
    left: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  item: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: spacing.xxs },
  label: { fontSize: 10, fontWeight: '700' },
});
