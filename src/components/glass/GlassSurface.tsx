import React, { useContext } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { BlurTargetContext } from './Aurora';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/tokens';
import { over } from '../../theme/color';

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
  // No elevation: Android draws an elevation shadow through translucent
  // glass as a dark smudge, and a list of them is a lot of shadow to draw.
  row: { edge: 0.55, sheen: 0.6, depth: 0.6, shadowRadius: 10, shadowY: 4, elevation: 0 },
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
 * Behind all of it, on the panes that lead a screen, the pane blurs what is
 * behind it for real, so the room's spheres soften into glowing colour through
 * the glass and stay crisp outside it:
 *
 *  - iOS: the system material.
 *  - Android 12 and up: a blur pointed at the screen's room (see `Screen`).
 *    Older Android draws blur on the CPU every frame, so there the pane is
 *    left as tinted glass.
 *  - Web: the browser's backdrop filter.
 *
 * A frost layer over the blur keeps text on the pane readable wherever the
 * brightest colour happens to fall behind it.
 */
export function GlassSurface({
  children,
  level = 'panel',
  blur = true,
  opaque = false,
  solidWithoutBlur = false,
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
  /** For panes whose contents need calm behind them: blurred where the
   *  platform can blur, solid where it can't, never bare glass. */
  solidWithoutBlur?: boolean;
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

  const room = useContext(BlurTargetContext);
  const dark = theme.mode === 'dark';
  // A live blur re-renders every frame the screen moves, so outside iOS it is
  // kept for the panes it matters most on — the one a screen leads with, and
  // work surfaces like the keypad — and the rest are tinted glass, which
  // scrolls for free. The web preview follows Android, so it shows what the
  // phone does.
  const wantsBlur = blur && !opaque && (Platform.OS === 'ios' || level === 'raised' || solidWithoutBlur);
  const method: BlurMethod | null = !wantsBlur
    ? null
    : Platform.OS === 'ios'
      ? 'ios'
      : Platform.OS === 'web'
        ? 'web'
        : Platform.OS === 'android' && room && Number(Platform.Version) >= 31
          ? 'android'
          : null;
  const solid = opaque || (solidWithoutBlur && !method);

  // Frost, fill and tint are all flat colour, so they are blended here into
  // one and drawn once, rather than stacked as views the GPU composites on
  // every frame.
  let glass = fill;
  if (tint) glass = over(tint, glass);
  if (method) glass = over(glass, theme.glassFrost);
  const base = solid ? over(glass, theme.surfaceSolid) : glass;

  // The many small panes of a list keep only what reads at their size: the
  // fill, the edge and the light along the top.
  const light = level !== 'row';

  return (
    <View
      style={[
        styles.outer,
        {
          borderRadius,
          shadowColor: dark ? '#000' : theme.shadow,
          shadowOpacity: dark ? 0.5 : 1,
          shadowRadius: d.shadowRadius,
          shadowOffset: { width: 0, height: d.shadowY },
          // Android casts an elevation shadow under the whole pane, and
          // through see-through glass it shows as a dark box inside the card.
          // Only solid panes get one.
          elevation: solid ? d.elevation : 0,
        },
        style,
      ]}
    >
      {/* The glass itself, pinned to the pane's edges: it takes the pane's
          size from the pane and never lends it any, so a pane is exactly as
          big as its caller or its contents make it. Its hairline edge is the
          view's own border, which the layers inside sit within. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.clip,
          {
            borderRadius,
            borderWidth: 1,
            borderColor: tintBorder ?? theme.glassBorder,
            backgroundColor: method ? 'transparent' : base,
          },
        ]}
        pointerEvents="none"
      >
        {method === 'ios' && (
          <BlurView intensity={theme.blurIntensity} tint={theme.glassTint} style={StyleSheet.absoluteFill} />
        )}
        {method === 'android' && room && (
          <BlurView
            blurTarget={room}
            blurMethod="dimezisBlurViewSdk31Plus"
            // Intensity sets the overlay's strength, and intensity divided by
            // the reduction factor the blur radius, in pixels: a light
            // overlay, and a radius wide enough to melt a sphere's edge.
            intensity={dark ? 36 : 30}
            blurReductionFactor={0.62}
            tint={dark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
            style={StyleSheet.absoluteFill}
          />
        )}
        {method === 'web' && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backdropFilter: 'blur(28px) saturate(160%)',
                WebkitBackdropFilter: 'blur(28px) saturate(160%)',
              } as ViewStyle,
            ]}
          />
        )}
        {method && <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]} />}

        {/* One wash for both lights: specular at the lit upper-left corner,
            clearing through the middle, and the pane's thickness gathering
            as shadow along the lower edge. */}
        {light && (
          <LinearGradient
            colors={[theme.glassSheen, 'transparent', theme.glassDepth]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.3, y: 1 }}
            style={[StyleSheet.absoluteFill, { opacity: d.sheen }]}
          />
        )}

        {/* Light caught on the top edge, and a shorter run down the left.
            The rounded clip trims both at the corners, as a real bevel would. */}
        <LinearGradient
          colors={[theme.glassEdge, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.edgeTop, { opacity: d.edge }]}
        />
        {light && (
          <LinearGradient
            colors={[theme.glassEdge, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.edgeLeft, { opacity: d.edge * 0.55 }]}
          />
        )}
      </View>

      <View style={[styles.clip, { borderRadius }, contentStyle]}>{children}</View>
    </View>
  );
}

type BlurMethod = 'ios' | 'android' | 'web';

const styles = StyleSheet.create({
  outer: { overflow: 'visible' },
  // No flex here on purpose. Growing to fill looks harmless on the web, but
  // Android's layout lets a growing child stretch an auto-sized pane to the
  // whole height available, which pushed every screen's content off the
  // bottom.
  clip: { overflow: 'hidden' },
  // Just inside the hairline border, which absolute children sit within.
  edgeTop: { position: 'absolute', top: 0, left: 0, right: '18%', height: 1 },
  edgeLeft: { position: 'absolute', top: 0, left: 0, bottom: '45%', width: 1 },
});
