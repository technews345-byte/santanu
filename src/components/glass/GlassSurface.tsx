import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/tokens';

export type GlassLevel = 'panel' | 'raised' | 'row';

/**
 * A pane of glass.
 *
 * Three layers make it read as a physical surface rather than a translucent
 * rectangle: the background thrown out of focus behind it, a tint that gives
 * the glass its own colour, and a sheen along the top edge where light would
 * catch it. The border is what gives it thickness.
 *
 * `blur` is opt-out because a blurred surface is expensive to composite on
 * Android: panes that scroll in a long list pay it on every frame for an
 * effect nobody can see moving. Those use the tint alone, which looks the
 * same at a glance and scrolls at full speed.
 */
export function GlassSurface({
  children,
  level = 'panel',
  blur = true,
  opaque = false,
  style,
  contentStyle,
  borderRadius = radius.xl,
}: {
  children?: React.ReactNode;
  level?: GlassLevel;
  blur?: boolean;
  /** Hide whatever sits behind this pane: a row over its own swipe actions,
   *  or chrome that has to stay readable over any content. */
  opaque?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  borderRadius?: number;
}) {
  const { theme } = useTheme();

  const fill =
    level === 'raised' ? theme.glassStrong : level === 'row' ? theme.surfaceAlt : theme.glass;

  // Blur is a real cost on Android and react-native-web has no equivalent, so
  // both fall back to the tint, which already carries the look.
  const useBlur = blur && Platform.OS !== 'web';

  return (
    <View
      style={[
        styles.outer,
        {
          borderRadius,
          shadowColor: theme.shadow,
          shadowOpacity: 1,
          shadowRadius: level === 'row' ? 8 : 20,
          shadowOffset: { width: 0, height: level === 'row' ? 3 : 10 },
          elevation: level === 'row' ? 2 : 6,
        },
        style,
      ]}
    >
      <View style={[styles.clip, { borderRadius }]}>
        {opaque && <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surfaceSolid }]} />}
        {useBlur && !opaque && (
          <BlurView
            intensity={level === 'row' ? theme.blurIntensity * 0.6 : theme.blurIntensity}
            tint={theme.glassTint}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />

        {/* Light falls from above, so the sheen is strongest at the top and
            gone by a third of the way down. */}
        <LinearGradient
          colors={[theme.glassSheen, 'transparent']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 0.75 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius,
              borderWidth: level === 'raised' ? 1.4 : 1,
              borderColor: theme.glassBorder,
            },
          ]}
          pointerEvents="none"
        />

        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { overflow: 'visible' },
  clip: { overflow: 'hidden' },
});
