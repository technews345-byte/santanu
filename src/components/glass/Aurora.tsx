import React, { createContext, RefObject, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { shade } from '../../theme/color';

/**
 * The view every glass pane on a screen blurs. Android's blur needs to be
 * pointed at the content it blurs, and that content is the room below.
 */
export const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

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

type Sphere = {
  key: string;
  cx: string;
  cy: string;
  r: string;
  /** Lit side, body, and the edge turned away from the light. */
  light: string;
  body: string;
  edge: string;
};

/**
 * Luminous objects in a dark room, for the glass to float in front of.
 *
 * Glass only reads as glass when there is something behind it with edges:
 * outside a pane these spheres are crisp, and through it they soften into
 * glowing colour. That difference is the whole effect. So the room holds a
 * few vivid, solid objects — lit from the upper-left like everything else,
 * with a highlight, a body and a shaded rim — and each spills a soft glow of
 * its own colour into the dark around it.
 *
 * They sit at the edges, mostly behind where panes are, so the text that
 * sits directly on the room stays on dark. Static on purpose: moving light
 * under blurred glass forces every pane to recomposite each frame.
 */
export function Aurora() {
  const { theme } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const dark = theme.mode === 'dark';

  const spheres: Sphere[] = [
    // Violet-indigo, high on the right: behind the balance, where the
    // strongest glass is, so the hero glows with it.
    { key: 'v', cx: '94%', cy: '14%', r: '31%', light: '#B9A8FF', body: '#5B4BFF', edge: '#1B1360' },
    // A warm answer on the left — the one contrast of temperature. Small and
    // tucked to the edge, so it glows behind the panes there and clears the
    // section titles that sit straight on the room.
    { key: 'o', cx: '-4%', cy: '50%', r: '13%', light: '#FFC08F', body: '#F4631F', edge: '#6E1E06' },
    // Cyan, bottom-right, closing the diagonal.
    { key: 'c', cx: '104%', cy: '86%', r: '26%', light: '#A8F6FF', body: '#12B4D6', edge: '#073A55' },
  ];

  const { hex: aOne, alpha: aOneA } = splitRgba(theme.auroraOne);
  const { hex: aTwo, alpha: aTwoA } = splitRgba(theme.auroraTwo);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          {spheres.map((s) => (
            <React.Fragment key={s.key}>
              {/* The body: highlight up and to the left, shading to the rim. */}
              <RadialGradient id={`${id}${s.key}`} cx="36%" cy="30%" r="72%" fx="34%" fy="26%">
                <Stop offset="0" stopColor={s.light} />
                <Stop offset="0.42" stopColor={s.body} />
                {/* A light room has no deep shadow for the rim to turn into. */}
                <Stop offset="1" stopColor={dark ? s.edge : shade(s.body, -0.12)} />
              </RadialGradient>
              {/* Its glow on the room around it. */}
              <RadialGradient id={`${id}${s.key}g`} cx="50%" cy="50%" r="50%">
                <Stop offset="0.55" stopColor={s.body} stopOpacity={dark ? 0.34 : 0.18} />
                <Stop offset="1" stopColor={s.body} stopOpacity={0} />
              </RadialGradient>
            </React.Fragment>
          ))}
          <RadialGradient id={`${id}key`} cx="8%" cy="4%" rx="85%" ry="42%" fx="8%" fy="4%">
            <Stop offset="0" stopColor={aOne} stopOpacity={aOneA} />
            <Stop offset="1" stopColor={aOne} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}fill`} cx="60%" cy="62%" rx="70%" ry="40%" fx="60%" fy="62%">
            <Stop offset="0" stopColor={aTwo} stopOpacity={aTwoA * 0.8} />
            <Stop offset="1" stopColor={aTwo} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect x="0" y="0" width="100%" height="100%" fill={theme.bg} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}key)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}fill)`} />

        {spheres.map((s) => (
          <Circle key={`${s.key}g`} cx={s.cx} cy={s.cy} r={`${parseFloat(s.r) * 1.9}%`} fill={`url(#${id}${s.key}g)`} />
        ))}
        {spheres.map((s) => (
          <Circle
            key={s.key}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            fill={`url(#${id}${s.key})`}
            opacity={dark ? 1 : 0.72}
          />
        ))}
      </Svg>
    </View>
  );
}
