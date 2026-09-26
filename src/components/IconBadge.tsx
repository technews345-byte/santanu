import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { shade, withAlpha } from '../theme/color';
import { GlassIcon, hasGlassIcon } from './GlassIcon';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * A category's icon. Categories Spendly designs for get their own drawn
 * glass object (see `GlassIcon`); any other glyph someone picks gets this
 * general version of the same idea.
 *
 * A layered glass icon: a vivid object behind, a frosted pane in front.
 *
 * Two layers, offset so they overlap. Behind, a sphere of the category's own
 * colour, lit from the upper-left. In front, a pane of frosted glass carrying
 * the glyph. Where the pane covers the sphere, the colour comes through it
 * softened — a pre-softened echo of the sphere drawn inside the pane at the
 * exact place it sits behind, which is what frosted glass over a coloured
 * object looks like, at no cost and identically on every platform. Where the
 * sphere clears the pane, it stays crisp.
 *
 * The glyph is the filled version, white in the dark theme: outline glyphs
 * thin to a hairline at this size.
 */
export const IconBadge = React.memo(function IconBadge({
  icon,
  color,
  size = 40,
}: {
  icon: IconName;
  color: string;
  size?: number;
  /** Kept for callers that set it; the icon scales its own glyph. */
  iconSize?: number;
}) {
  const { theme } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const dark = theme.mode === 'dark';
  if (hasGlassIcon(icon)) return <GlassIcon icon={icon} color={color} size={size} dark={dark} />;
  const glyph = solidGlyph(icon);

  // Geometry, as fractions of the icon's box.
  const orb = size * 0.6; // the sphere behind
  const orbX = size * 0.4;
  const orbY = size * 0.0;
  const pane = size * 0.74; // the glass in front
  const paneX = size * 0.02;
  const paneY = size * 0.24;
  const paneR = pane * 0.3;

  // Where the sphere's centre falls inside the pane, for the echo.
  const echoX = orbX + orb / 2 - paneX;
  const echoY = orbY + orb / 2 - paneY;

  return (
    <View style={{ width: size, height: size }}>
      {/* Behind: the sphere, crisp, with a glow of its own colour. */}
      <View
        style={[
          styles.orb,
          {
            left: orbX,
            top: orbY,
            width: orb,
            height: orb,
            borderRadius: orb / 2,
            backgroundColor: color,
            shadowColor: color,
            shadowOpacity: dark ? 0.7 : 0.4,
            shadowRadius: size * 0.2,
          },
        ]}
      >
        <LinearGradient
          colors={[shade(color, 0.42), color, shade(color, -0.3)]}
          locations={[0, 0.5, 1]}
          start={{ x: 0.15, y: 0.05 }}
          end={{ x: 0.85, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: orb / 2 }]}
        />
      </View>

      {/* In front: the frosted pane. */}
      <View
        style={[
          styles.pane,
          {
            left: paneX,
            top: paneY,
            width: pane,
            height: pane,
            borderRadius: paneR,
            shadowOpacity: dark ? 0.45 : 0.14,
            shadowRadius: size * 0.12,
            shadowOffset: { width: 0, height: size * 0.06 },
          },
        ]}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.clip,
            { borderRadius: paneR, backgroundColor: withAlpha(color, dark ? 0.22 : 0.16) },
          ]}
        >
          {/* The sphere as seen through frosted glass: same colour, same
              place, edges gone soft. */}
          <Svg width={pane} height={pane} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id={`${id}e`} cx={echoX} cy={echoY} r={orb * 0.95} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={shade(color, 0.25)} stopOpacity={1} />
                <Stop offset="0.5" stopColor={color} stopOpacity={0.8} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={echoX} cy={echoY} r={orb * 0.95} fill={`url(#${id}e)`} />
          </Svg>
          {/* The frost itself: milky light, brighter where the light lands. */}
          <LinearGradient
            colors={
              dark
                ? ['rgba(255, 255, 255, 0.26)', 'rgba(255, 255, 255, 0.06)']
                : ['rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.2)']
            }
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: paneR }]} />
        <Ionicons
          name={glyph}
          size={Math.round(size * 0.38)}
          // White is lost on light frost; there the glyph takes the category's
          // own colour, deepened until it holds against the pale pane.
          color={dark ? '#FFFFFF' : shade(color, -0.28)}
          style={dark ? styles.glyph : undefined}
        />
      </View>

    </View>
  );
});

/** The filled version of an outline glyph, when the set has one. */
export function solidGlyph(icon: IconName): IconName {
  if (!icon.endsWith('-outline')) return icon;
  const solid = icon.slice(0, -'-outline'.length);
  return solid in Ionicons.glyphMap ? (solid as IconName) : icon;
}

const styles = StyleSheet.create({
  orb: { position: 'absolute', shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  pane: { position: 'absolute', alignItems: 'center', justifyContent: 'center', shadowColor: '#000' },
  clip: { overflow: 'hidden' },
  rim: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderTopColor: 'rgba(255, 255, 255, 0.62)',
    borderLeftColor: 'rgba(255, 255, 255, 0.45)',
  },
  glyph: {
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
