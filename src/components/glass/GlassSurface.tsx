import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/tokens';

/**
 * How near the viewer a pane sits. Nearer panes are brighter, catch more
 * light on their edge and throw a longer shadow.
 *
 * - `raised`  the pane a screen leads with — the balance, a hero chart
 * - `panel`   primary panels
 * - `row`     secondary cards: list rows, the many small tiles
 * - `control` chips, buttons and capsules, nearest the finger
 */
export type GlassLevel = 'raised' | 'panel' | 'row' | 'control';

type Depth = { edge: number; sheen: number; depth: number; shadowRadius: number; shadowY: number; elevation: number };

const DEPTH: Record<GlassLevel, Depth> = {
  raised: { edge: 1, sheen: 1, depth: 1, shadowRadius: 28, shadowY: 14, elevation: 8 },
  panel: { edge: 0.8, sheen: 0.85, depth: 0.85, shadowRadius: 20, shadowY: 10, elevation: 6 },
  row: { edge: 0.55, sheen: 0.6, depth: 0.6, shadowRadius: 10, shadowY: 4, elevation: 2 },
  control: { edge: 0.9, sheen: 0.9, depth: 0.5, shadowRadius: 10, shadowY: 4, elevation: 3 },
};

/**
 * A pane of glass.
 *
 * A translucent rectangle is not glass; what makes it read as a physical
 * object is how light behaves on it. So each pane is built in layers, back to
 * front:
 *
 *  1. the tint of the glass itself, light enough to let the room through
 *  2. a broad specular wash falling from the upper-left, where the room's
 *     main light is
 *  3. shadow gathered inside the lower edge — the pane's own thickness
 *  4. a hairline edge all the way round
 *  5. light caught along the top edge, brightest at the left and dying out
 *     across, with a shorter run down the left side
 *
 * Only (5) is bright, and only for a pixel, which is what keeps it from
 * looking like a white border.
 *
 * Blur runs on iOS only. Android's blur in this SDK needs the blurred content
 * wrapped in a target view and redraws every frame per pane; with nothing
 * behind these panes but already-soft light, a real blur there would look
 * identical and cost frame rate. Without a blur method Android's BlurView is
 * just an extra dark overlay, so it is skipped rather than left darkening
 * every pane.
 */
export function GlassSurface({
  children,
  level = 'panel',
  blur = true,
  opaque = false,
  style,
  contentStyle,
  borderRadius = radius.xl,
  tint,
  tintBorder,
}: {
  children?: React.ReactNode;
  level?: GlassLevel;
  /** Colours the glass itself: light passing through tinted glass, for
   *  accent controls, rather than a coat of paint on top of it. */
  tint?: string;
  /** Edge colour for tinted glass, which catches its own colour at the rim. */
  tintBorder?: string;
  blur?: boolean;
  /** Hide whatever sits behind this pane: a row over its own swipe actions,
   *  or chrome that has to stay readable over any content. */
  opaque?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  borderRadius?: number;
}) {
  const { theme } = useTheme();
  const d = DEPTH[level];

  const fill =
    level === 'raised'
      ? theme.glassStrong
      : level === 'control'
        ? theme.glassControl
        : level === 'row'
          ? theme.surfaceAlt
          : theme.glass;

  const useBlur = blur && !opaque && Platform.OS === 'ios';

  return (
    <View
      style={[
        styles.outer,
        {
          borderRadius,
          shadowColor: theme.mode === 'dark' ? '#000' : theme.shadow,
          shadowOpacity: theme.mode === 'dark' ? 0.5 : 1,
          shadowRadius: d.shadowRadius,
          shadowOffset: { width: 0, height: d.shadowY },
          elevation: d.elevation,
        },
        style,
      ]}
    >
      <View style={[styles.clip, { borderRadius }]}>
        {opaque && <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surfaceSolid }]} />}
        {useBlur && (
          <BlurView intensity={theme.blurIntensity * (level === 'row' ? 0.6 : 1)} tint={theme.glassTint} style={StyleSheet.absoluteFill} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
        {tint && <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />}

        {/* Specular wash: strongest at the lit corner, gone by the middle. */}
        <LinearGradient
          colors={[theme.glassSheen, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.75, y: 0.7 }}
          style={[StyleSheet.absoluteFill, { opacity: d.sheen }]}
          pointerEvents="none"
        />

        {/* Thickness: shadow collects inside the lower edge. */}
        <LinearGradient
          colors={['transparent', theme.glassDepth]}
          start={{ x: 0, y: 0.55 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: d.depth }]}
          pointerEvents="none"
        />

        <View
          style={[StyleSheet.absoluteFill, { borderRadius, borderWidth: 1, borderColor: tintBorder ?? theme.glassBorder }]}
          pointerEvents="none"
        />

        {/* Light caught on the top edge, and a shorter run down the left.
            The rounded clip trims both at the corners, as a real bevel would. */}
        <LinearGradient
          colors={[theme.glassEdge, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.edgeTop, { opacity: d.edge }]}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[theme.glassEdge, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.edgeLeft, { opacity: d.edge * 0.55 }]}
          pointerEvents="none"
        />

        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { overflow: 'visible' },
  // Always the pane's full size: grown to a fixed height (a tile, a tab
  // marker), and stretched across even when a caller's style centres the
  // pane's contents — otherwise the glass shrinks to whatever it holds.
  clip: { overflow: 'hidden', flexGrow: 1, alignSelf: 'stretch' },
  edgeTop: { position: 'absolute', top: 0, left: 0, right: '18%', height: 1 },
  edgeLeft: { position: 'absolute', top: 0, left: 0, bottom: '45%', width: 1 },
});
