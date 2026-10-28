import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Text } from '../../theme/type';
import { useReducedMotion } from '../../theme/useReducedMotion';
import { useTheme } from '../../theme/ThemeContext';
import { motion } from '../../theme/tokens';
import { GlassSurface } from './GlassSurface';

export const TAB_BAR_HEIGHT = 68;
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: 'home-outline', Transactions: 'list-outline', Budgets: 'pie-chart-outline',
  Analytics: 'stats-chart-outline', Settings: 'settings-outline',
};

/** Floating, labelled navigation. All five existing destinations remain reachable. */
export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const travel = useRef(new Animated.Value(state.index)).current;
  useEffect(() => {
    if (reduced) { travel.stopAnimation(); travel.setValue(state.index); return; }
    const animation = Animated.spring(travel, { toValue: state.index, useNativeDriver: true, ...motion.glide });
    animation.start();
    return () => animation.stop();
  }, [state.index, reduced, travel]);
  const slot = width / state.routes.length;
  const translateX = travel.interpolate({ inputRange: state.routes.map((_, i) => i), outputRange: state.routes.map((_, i) => i * slot) });
  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <GlassSurface level="raised" solidWithoutBlur borderRadius={34} contentStyle={styles.shell}>
        <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {slot > 0 && <Animated.View pointerEvents="none" style={[styles.selection, { width: slot - 6, backgroundColor: theme.tintMuted, borderColor: theme.glassBorder, transform: [{ translateX }] }]} />}
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const { options } = descriptors[route.key];
            const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;
            return <DockItem key={route.key} focused={focused} label={label} icon={ICONS[route.name] ?? 'ellipse-outline'}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (focused || event.defaultPrevented) return;
                if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                navigation.navigate(route.name);
              }} />;
          })}
        </View>
      </GlassSurface>
    </View>
  );
}
function DockItem({ focused, label, icon, onPress, onLongPress, accessibilityLabel }: {
  focused: boolean; label: string; icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void; onLongPress: () => void; accessibilityLabel: string;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const press = useRef(new Animated.Value(1)).current;
  const to = (value: number) => { if (!reduced) Animated.spring(press, { toValue: value, useNativeDriver: true, ...motion.press }).start(); };
  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: focused }}
      style={styles.item} onPress={onPress} onLongPress={onLongPress} onPressIn={() => to(0.96)} onPressOut={() => to(1)}>
      <Animated.View style={[styles.itemInner, { transform: [{ scale: press }] }]}>
        <Ionicons name={icon} size={22} color={focused ? theme.tint : theme.textSecondary} />
        <Text numberOfLines={1} style={[styles.label, { color: focused ? theme.text : theme.textSecondary }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  dock: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20 },
  shell: { height: TAB_BAR_HEIGHT, padding: 6 },
  row: { flex: 1, flexDirection: 'row' },
  selection: { position: 'absolute', left: 3, top: 0, bottom: 0, borderRadius: 26, borderWidth: 1 },
  item: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  itemInner: { alignItems: 'center', gap: 4 },
  label: { fontSize: 10, fontWeight: '500' },
});
