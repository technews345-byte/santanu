import React, { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Spendly's tab icons: glossy orbs of coloured glass with a white symbol
 * inside, each tab in its own colour.
 *
 * An orb is lit from the upper left: a bright spot there, its colour
 * deepening toward the far edge, a sheet of gloss over the top, a lit rim,
 * and light gathered again inside the lower edge, where it comes back
 * through the glass. The symbol is a separate layer so it can move on its
 * own (the gear spins) without the lighting turning with it.
 *
 * Flat fills and gradients only — no filters or masks, which phones draw
 * slowly — and an orb redraws only when its tab changes.
 */
export type OrbColors = {
  /** The lit spot, upper left. */
  light: string;
  /** The orb's own colour. */
  base: string;
  /** Its colour at the far edge, away from the light. */
  edge: string;
  /** The halo when selected, and the indicator under the label. */
  glow: string;
  /** The symbol's colour, where white would not show (silver glass). */
  glyph?: string;
};

export const ORB_SIZE = 44;

export function Orb({ colors }: { colors: OrbColors }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={ORB_SIZE} height={ORB_SIZE} viewBox="0 0 44 44">
      <Defs>
        <RadialGradient id={`${uid}b`} cx="34%" cy="28%" rx="78%" ry="78%" fx="34%" fy="28%">
          <Stop offset="0" stopColor={colors.light} />
          <Stop offset="0.52" stopColor={colors.base} />
          <Stop offset="1" stopColor={colors.edge} />
        </RadialGradient>
        <LinearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.62} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.8} />
          <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0.05} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.35} />
        </LinearGradient>
        <RadialGradient id={`${uid}c`} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={colors.light} stopOpacity={0.75} />
          <Stop offset="1" stopColor={colors.light} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={22} cy={22} r={20} fill={`url(#${uid}b)`} />
      {/* Light returning through the glass, gathered inside the lower edge */}
      <Ellipse cx={22} cy={34.5} rx={11} ry={4.2} fill={`url(#${uid}c)`} />
      {/* Gloss over the top */}
      <Ellipse cx={20.5} cy={12.5} rx={13} ry={8} fill={`url(#${uid}g)`} />
      <Circle cx={22} cy={22} r={19.5} stroke={`url(#${uid}r)`} strokeWidth={1} fill="none" />
    </Svg>
  );
}

/** Symbols are drawn in a 24-unit box and shown at this size, centred on the orb. */
export const GLYPH_SIZE = 24;

type GlyphProps = { color?: string; hole?: string };

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 24 24">
      {/* A faint shadow under the symbol lifts it off the glass */}
      <G transform="translate(0 0.8)" opacity={0.22}>
        {React.Children.map(children, (child) =>
          React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<any>, { fill: '#000000' }) : child
        )}
      </G>
      {children}
    </Svg>
  );
}

export function HomeGlyph({ color = '#FFFFFF' }: GlyphProps) {
  return (
    <Glyph>
      <Path
        fill={color}
        d="M12.9 3.6a1.4 1.4 0 0 0-1.8 0L3.6 9.9c-.8.7-.3 2 .8 2H5.6v7.3c0 .9.7 1.6 1.6 1.6h2.9v-4.6c0-.7.6-1.3 1.3-1.3h1.2c.7 0 1.3.6 1.3 1.3v4.6h2.9c.9 0 1.6-.7 1.6-1.6v-7.3h1.2c1.1 0 1.6-1.3.8-2z"
      />
    </Glyph>
  );
}

export function ActivityGlyph({ color = '#FFFFFF' }: GlyphProps) {
  return (
    <Glyph>
      <Circle fill={color} cx={5.4} cy={6.6} r={1.7} />
      <Circle fill={color} cx={5.4} cy={12} r={1.7} />
      <Circle fill={color} cx={5.4} cy={17.4} r={1.7} />
      <Rect fill={color} x={9.2} y={5.3} width={10.6} height={2.6} rx={1.3} />
      <Rect fill={color} x={9.2} y={10.7} width={10.6} height={2.6} rx={1.3} />
      <Rect fill={color} x={9.2} y={16.1} width={10.6} height={2.6} rx={1.3} />
    </Glyph>
  );
}

export function BudgetGlyph({ color = '#FFFFFF' }: GlyphProps) {
  return (
    <Glyph>
      <Path fill={color} opacity={0.82} d="M10.8 4.4a8.2 8.2 0 1 0 9 9.4h-7.6c-.8 0-1.4-.6-1.4-1.4z" />
      <Path fill={color} d="M13.4 2.6a8.4 8.4 0 0 1 8 8c0 .5-.4.9-.9.9h-6.6c-.5 0-.9-.4-.9-.9V3.5c0-.5.4-.9.9-.9z" />
    </Glyph>
  );
}

export function InsightsGlyph({ color = '#FFFFFF' }: GlyphProps) {
  return (
    <Glyph>
      <Rect fill={color} x={4.4} y={13} width={4} height={7.4} rx={2} />
      <Rect fill={color} x={10} y={8.6} width={4} height={11.8} rx={2} />
      <Rect fill={color} x={15.6} y={4} width={4} height={16.4} rx={2} />
    </Glyph>
  );
}

// A gear with soft, rounded teeth: a circle whose radius swells eight times
// around, so every tooth is a smooth lobe rather than a sharp notch.
const GEAR = (() => {
  const steps = 144;
  const points: string[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = 7.4 + 1.4 * Math.max(-0.55, Math.min(0.85, Math.cos(8 * a) * 1.15));
    points.push(`${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
})();

export function SettingsGlyph({ color = '#FFFFFF', hole = '#4A5263' }: GlyphProps) {
  return (
    <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 24 24">
      <G transform="translate(0 0.8)" opacity={0.22}>
        <Path fill="#000000" d={GEAR} />
      </G>
      <Path fill={color} d={GEAR} />
      <Circle fill={hole} cx={12} cy={12} r={3} />
    </Svg>
  );
}
