import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../../theme/tokens';

/** Lightens a hex colour towards white, for the lit top of the badge. */
function lighten(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full.slice(0, 6), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * amount);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/**
 * A solid disc of colour with the icon cut out of it.
 *
 * Against glass, a flat tinted square disappears; a saturated disc with its
 * own light and its own shadow is the one thing on the panel that clearly
 * sits in front, which is what makes the glass behind it read as glass.
 */
export function GradientBadge({
  icon,
  color,
  size = 52,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.shadow,
        { width: size, height: size, borderRadius: size / 2, shadowColor: color },
      ]}
    >
      <LinearGradient
        colors={[lighten(color, 0.28), color]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Ionicons name={icon} size={size * 0.46} color="#FFFFFF" />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  disc: { alignItems: 'center', justifyContent: 'center' },
});
