import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';

/**
 * The scene the glass is seen against.
 *
 * Frosted glass is only convincing when there is something behind it worth
 * blurring: over a flat fill a panel reads as a rectangle of paint, because
 * nothing shifts across it. These overlapping soft orbs give the backdrop
 * light and dark places, so a pane laid over them picks up a gradient it did
 * not paint itself.
 *
 * Each orb is a gradient fading to nothing rather than a hard disc, which is
 * what makes the edges melt without costing a blur pass. Static on purpose:
 * animating underneath a blurred surface forces a recomposite every frame,
 * which is the thing that makes glass feel slow.
 */
export function Aurora() {
  const { theme } = useTheme();
  const { auroraOne, auroraTwo, auroraThree } = theme;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} />

      {/* Large, low-contrast fields set the overall cast of the screen. */}
      <Orb color={auroraOne} size={520} top={-170} left={-150} />
      <Orb color={auroraTwo} size={560} top={120} left={160} />
      <Orb color={auroraThree} size={460} top={430} left={-140} />
      <Orb color={auroraOne} size={500} top={620} left={120} />

      {/* Smaller, brighter ones read as bokeh and give the surface its
          sparkle where they pass under a panel's edge. */}
      <Orb color={auroraTwo} size={190} top={60} left={250} />
      <Orb color={auroraThree} size={150} top={300} left={30} />
      <Orb color={auroraOne} size={210} top={520} left={220} />
      <Orb color={auroraTwo} size={130} top={760} left={40} />
      <Orb color={auroraThree} size={170} top={870} left={230} />
    </View>
  );
}

function Orb({
  color,
  size,
  top,
  left,
}: {
  color: string;
  size: number;
  top: number;
  left: number;
}) {
  return (
    <LinearGradient
      colors={[color, 'transparent']}
      start={{ x: 0.3, y: 0.15 }}
      end={{ x: 0.8, y: 0.9 }}
      style={{
        position: 'absolute',
        top,
        left,
        width: size,
        height: size,
        borderRadius: size / 2,
      }}
    />
  );
}
