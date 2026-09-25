import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

/**
 * Splits `rgba(r, g, b, a)` into a solid colour and its alpha. Stop colours
 * with alpha are honoured unevenly across SVG renderers, while stopOpacity is
 * not, so the alpha always travels on its own.
 */
export function splitRgba(color: string): { hex: string; alpha: number } {
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (!m) return { hex: color, alpha: 1 };
  const hex = '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
  return { hex, alpha: m[4] === undefined ? 1 : Number(m[4]) };
}

/**
 * The room the glass floats in.
 *
 * Not a pattern and not a wash: a few very large radial light sources, each
 * falling off to nothing, so the space reads as dark but not empty. The main
 * source sits upper-left, matching the highlight every pane carries on that
 * edge, so the light on the glass and the light in the room agree. A cooler
 * teal answers it from the lower-right, and a faint third lifts the middle
 * where the headline figures sit.
 *
 * Radial rather than the earlier linear orbs, which were discs with a
 * gradient drawn across them and so had a visible edge. A radial gradient has
 * no edge at all. Static on purpose: moving light under a translucent pane
 * forces it to recomposite every frame.
 */
export function Aurora() {
  const { theme } = useTheme();
  // Gradient ids are global in a web page, and several screens are mounted at
  // once. Colons from useId are not safe inside url(#…), so strip them.
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');

  const sources = [
    // [id suffix, colour, cx, cy, rx, ry, peak opacity]
    ['key', theme.auroraOne, '8%', '4%', '85%', '42%', 1],
    ['fill', theme.auroraTwo, '100%', '78%', '80%', '38%', 1],
    ['lift', theme.auroraThree, '62%', '30%', '55%', '22%', 1],
  ] as const;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          {sources.map(([key, color, cx, cy, rx, ry, peak]) => {
            const { hex, alpha } = splitRgba(color);
            const top = alpha * peak;
            return (
              <RadialGradient key={key} id={`${id}${key}`} cx={cx} cy={cy} rx={rx} ry={ry} fx={cx} fy={cy}>
                {/* Three stops rather than two give a soft shoulder instead
                    of a cone, the way light actually falls off. */}
                <Stop offset="0" stopColor={hex} stopOpacity={top} />
                <Stop offset="0.45" stopColor={hex} stopOpacity={top * 0.38} />
                <Stop offset="1" stopColor={hex} stopOpacity={0} />
              </RadialGradient>
            );
          })}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={theme.bg} />
        {sources.map(([key]) => (
          <Rect key={key} x="0" y="0" width="100%" height="100%" fill={`url(#${id}${key})`} />
        ))}
      </Svg>
    </View>
  );
}
