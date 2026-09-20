import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';

/**
 * The wash the glass is seen against.
 *
 * Blur needs something worth blurring: a panel over a flat fill looks like a
 * rectangle of paint, because nothing behind it changes. These three soft
 * colour fields give the background variation, so a panel laid over them
 * reads as a pane with a scene behind it.
 *
 * Static on purpose — an animating backdrop under a blurred surface forces a
 * recomposite every frame, which is exactly the cost that makes glass feel
 * slow.
 */
export function Aurora() {
  const { theme } = useTheme();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} />

      <LinearGradient
        colors={[theme.auroraOne, 'transparent']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 0.55 }}
        style={[styles.field, styles.topLeft]}
      />
      <LinearGradient
        colors={['transparent', theme.auroraTwo]}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 1, y: 1 }}
        style={[styles.field, styles.bottomRight]}
      />
      <LinearGradient
        colors={[theme.auroraThree, 'transparent']}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.8, y: 0.2 }}
        style={[styles.field, styles.bottomLeft]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { position: 'absolute' },
  topLeft: { top: -120, left: -80, width: 460, height: 460, borderRadius: 230 },
  bottomRight: { top: '28%', right: -140, width: 480, height: 480, borderRadius: 240 },
  bottomLeft: { bottom: -160, left: -120, width: 440, height: 440, borderRadius: 220 },
});
