import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function IconBadge({
  icon,
  color,
  size = 40,
  iconSize,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  size?: number;
  iconSize?: number;
}) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}24` },
      ]}
    >
      <Ionicons name={icon} size={iconSize ?? size * 0.5} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
